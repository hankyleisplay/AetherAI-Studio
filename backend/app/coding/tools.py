"""
Coding toolset bound to a single project root.

Modelled on what makes autonomous coding agents effective:
- search before reading (glob / grep), read by line range with line numbers,
- edit with exact string replacement instead of rewriting whole files,
- refuse to overwrite or edit a file the agent hasn't read (prevents blind clobbering),
- run shell commands in the project with real timeouts and head/tail-truncated output.

Every tool returns a ToolResult; `display` carries structured data for the UI (diffs, todos).
"""
import difflib
import fnmatch
import json
import locale
import os
import platform
import re
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

IGNORED_DIRS = {
    ".git", "node_modules", "__pycache__", ".venv", "venv", "env", ".env", "dist", "build", ".next",
    ".nuxt", "target", ".idea", ".vscode", ".cache", "coverage", ".mypy_cache", ".pytest_cache",
    ".tox", ".gradle", "bin", "obj", ".turbo", ".parcel-cache",
}
BINARY_EXTS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".pdf", ".zip", ".gz", ".tar", ".7z",
    ".exe", ".dll", ".so", ".dylib", ".bin", ".pyc", ".class", ".jar", ".woff", ".woff2", ".ttf",
    ".otf", ".mp3", ".mp4", ".wav", ".mov", ".sqlite", ".db", ".lock",
}
MAX_OUTPUT_CHARS = 12000
READ_DEFAULT_LIMIT = 400
MAX_LINE_CHARS = 500
IS_WINDOWS = platform.system() == "Windows"


@dataclass
class ToolResult:
    ok: bool
    output: str
    display: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ToolSpec:
    name: str
    description: str
    parameters: Dict[str, Any]
    required: List[str]
    mutating: bool  # needs approval in Accept Edit mode
    fn: Callable[..., ToolResult]

    def schema(self) -> Dict[str, Any]:
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": {"type": "object", "properties": self.parameters, "required": self.required},
            },
        }


def _decode(data: Optional[bytes]) -> str:
    if not data:
        return ""
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        return data.decode(locale.getpreferredencoding(False) or "utf-8", errors="replace")


def shell_info() -> Dict[str, str]:
    """The shell run_command uses. Prefer PowerShell 7 (pwsh) on Windows: it supports `&&` / `||`,
    which models use constantly and Windows PowerShell 5.1 rejects."""
    if IS_WINDOWS:
        pwsh = shutil.which("pwsh")
        if pwsh:
            return {"name": "PowerShell 7", "exe": pwsh, "kind": "pwsh"}
        return {"name": "Windows PowerShell 5.1", "exe": "powershell.exe", "kind": "powershell"}
    return {"name": "bash", "exe": shutil.which("bash") or "/bin/sh", "kind": "bash"}


def _shell_command(command: str):
    sh = shell_info()
    if sh["kind"] == "bash":
        return [sh["exe"], "-lc", command]
    if sh["kind"] == "powershell" and re.search(r"&&|\|\|", command):
        # 5.1 can't parse && / ||; cmd.exe can, and simple chains (cd, python, npm, git) work the same there.
        # Passed as one raw string: list quoting would turn inner quotes into \" which cmd doesn't understand.
        return f'cmd.exe /d /s /c "chcp 65001>nul & {command}"'
    prefix = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; $ProgressPreference='SilentlyContinue'; "
    # -Command collapses any failure to exit code 1; pass the real native exit code through instead
    suffix = "\n$__ok = $?; if ($LASTEXITCODE) { exit $LASTEXITCODE }; if (-not $__ok) { exit 1 }"
    return [sh["exe"], "-NoProfile", "-NonInteractive", "-Command", prefix + command + suffix]


def _kill_tree(pid: int):
    """Kill a process and all its children; killing only the shell leaves e.g. dev servers holding the pipes."""
    try:
        import psutil
        parent = psutil.Process(pid)
        procs = parent.children(recursive=True) + [parent]
        for p in procs:
            try:
                p.kill()
            except Exception:
                pass
        psutil.wait_procs(procs, timeout=3)
    except Exception:
        if IS_WINDOWS:
            subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)], capture_output=True,
                           creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))


def _to_bool(v: Any) -> bool:
    if isinstance(v, str):
        return v.strip().lower() in ("true", "1", "yes", "y", "on")
    return bool(v)


def _coerce(value: Any, schema: Dict[str, Any]) -> Any:
    """Local models often send numbers and booleans as strings ("10", "false")."""
    t = schema.get("type")
    try:
        if t == "integer" and not isinstance(value, bool):
            return int(float(value))
        if t == "boolean":
            return _to_bool(value)
        if t == "array" and isinstance(value, str):
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else [parsed]
        if t == "string" and not isinstance(value, str) and value is not None:
            return json.dumps(value, ensure_ascii=False) if isinstance(value, (dict, list)) else str(value)
    except (ValueError, TypeError, json.JSONDecodeError):
        return value
    return value


def truncate_middle(text: str, limit: int = MAX_OUTPUT_CHARS) -> str:
    """Keep the head and the tail: errors and summaries usually live at the end of command output."""
    if len(text) <= limit:
        return text
    head = int(limit * 0.4)
    tail = limit - head
    omitted = len(text) - limit
    return f"{text[:head]}\n\n... [{omitted} characters omitted] ...\n\n{text[-tail:]}"


class CodingToolset:
    def __init__(self, root: Path, state: Dict[str, Any]):
        self.root = root.resolve()
        # Per-session state persisted by the agent: files read (with mtime), todo list
        self.state = state
        self.state.setdefault("read_files", {})
        self.state.setdefault("todos", [])
        # Set when the user presses stop: long-running tools (run_command) check it and abort
        self.cancel = threading.Event()
        self.specs: Dict[str, ToolSpec] = {}
        self._register_all()

    # ---------------------------------------------------------------- helpers
    def _resolve(self, path: Optional[str]) -> Path:
        raw = (path or ".").strip().strip('"').strip("'") or "."
        p = Path(raw)
        target = (p if p.is_absolute() else self.root / p).resolve()
        if target != self.root and self.root not in target.parents:
            raise ValueError(f"Path '{raw}' is outside the project root ({self.root}).")
        return target

    def _rel(self, p: Path) -> str:
        return "." if p == self.root else p.relative_to(self.root).as_posix()

    def _mark_read(self, p: Path):
        try:
            self.state["read_files"][str(p)] = p.stat().st_mtime
        except OSError:
            pass

    def _check_fresh_read(self, p: Path) -> Optional[str]:
        """An existing file must be read (and unchanged since) before it is edited or overwritten."""
        seen = self.state["read_files"].get(str(p))
        if seen is None:
            return f"You must read '{self._rel(p)}' with read_file before modifying it."
        try:
            if p.stat().st_mtime > seen + 1e-6:
                return f"'{self._rel(p)}' changed on disk since you last read it. Read it again before modifying it."
        except OSError:
            pass
        return None

    def _walk_files(self, base: Path):
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = sorted(d for d in dirnames if d not in IGNORED_DIRS and not d.startswith("."))
            for name in sorted(filenames):
                yield Path(dirpath) / name

    @staticmethod
    def _diff(old: str, new: str, rel: str) -> str:
        lines = difflib.unified_diff(
            old.splitlines(), new.splitlines(), fromfile=f"a/{rel}", tofile=f"b/{rel}", lineterm="", n=3
        )
        return "\n".join(lines)

    def _register(self, name: str, description: str, parameters: Dict[str, Any], required: List[str],
                  mutating: bool = False):
        def deco(fn):
            self.specs[name] = ToolSpec(name, description, parameters, required, mutating, fn)
            return fn
        return deco

    # ---------------------------------------------------------------- tools
    def _register_all(self):
        R = self._register

        @R("list_dir",
           "List files and folders as a tree (dependency/build folders are skipped). Use it to get oriented in the project.",
           {"path": {"type": "string", "description": "Folder relative to the project root (default '.')."},
            "depth": {"type": "integer", "description": "How many levels deep to list (1-4, default 2)."}},
           [])
        def list_dir(path: str = ".", depth: int = 2) -> ToolResult:
            base = self._resolve(path)
            if not base.is_dir():
                return ToolResult(False, f"'{self._rel(base)}' is not a directory.")
            depth = max(1, min(int(depth or 2), 4))
            lines: List[str] = []
            count = 0

            def walk(d: Path, level: int, prefix: str):
                nonlocal count
                try:
                    entries = sorted(d.iterdir(), key=lambda e: (not e.is_dir(), e.name.lower()))
                except OSError:
                    return
                for e in entries:
                    if count >= 400:
                        return
                    if e.is_dir() and (e.name in IGNORED_DIRS or e.name.startswith(".")):
                        continue
                    count += 1
                    if e.is_dir():
                        lines.append(f"{prefix}{e.name}/")
                        if level < depth:
                            walk(e, level + 1, prefix + "  ")
                    else:
                        try:
                            size = e.stat().st_size
                        except OSError:
                            size = 0
                        lines.append(f"{prefix}{e.name} ({size} B)")

            walk(base, 1, "")
            if count >= 400:
                lines.append("... (truncated at 400 entries; list a subfolder for more)")
            return ToolResult(True, f"{self._rel(base)}/\n" + ("\n".join(lines) or "(empty)"))

        @R("glob",
           "Find files by name pattern, e.g. '**/*.py', 'src/**/*.tsx', '*config*'. Returns paths sorted by most recently modified.",
           {"pattern": {"type": "string", "description": "Glob pattern relative to the project root."}},
           ["pattern"])
        def glob(pattern: str) -> ToolResult:
            pat = pattern.strip().replace("\\", "/")
            if "/" not in pat and not pat.startswith("**"):
                pat = "**/" + pat
            matches = []
            for f in self._walk_files(self.root):
                rel = f.relative_to(self.root).as_posix()
                if fnmatch.fnmatch(rel, pat) or (pat.startswith("**/") and fnmatch.fnmatch(rel, pat[3:])):
                    try:
                        matches.append((f.stat().st_mtime, rel))
                    except OSError:
                        pass
            matches.sort(reverse=True)
            if not matches:
                return ToolResult(True, f"No files match '{pattern}'.")
            shown = [m[1] for m in matches[:200]]
            more = f"\n... and {len(matches) - 200} more" if len(matches) > 200 else ""
            return ToolResult(True, "\n".join(shown) + more)

        @R("grep",
           "Search file contents with a regular expression. Returns matching lines as path:line: text. Use it to find definitions, usages and error strings.",
           {"pattern": {"type": "string", "description": "Regular expression (Python/ripgrep syntax)."},
            "path": {"type": "string", "description": "File or folder to search (default: project root)."},
            "include": {"type": "string", "description": "Only search files matching this glob, e.g. '*.py'."},
            "ignore_case": {"type": "boolean", "description": "Case-insensitive search."}},
           ["pattern"])
        def grep(pattern: str, path: str = ".", include: Optional[str] = None, ignore_case: bool = False) -> ToolResult:
            base = self._resolve(path)
            rg = shutil.which("rg")
            if rg:
                cmd = [rg, "--line-number", "--no-heading", "--color", "never", "--max-columns", str(MAX_LINE_CHARS),
                       "--max-count", "50"]
                if ignore_case:
                    cmd.append("-i")
                if include:
                    cmd += ["--glob", include]
                for d in IGNORED_DIRS:
                    cmd += ["--glob", f"!{d}/"]
                # Run from the project root with a relative target so results come back as relative paths
                cmd += ["-e", pattern, self._rel(base)]
                try:
                    res = subprocess.run(cmd, cwd=str(self.root), capture_output=True, timeout=30,
                                         creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                    if res.returncode not in (0, 1):
                        return ToolResult(False, f"grep failed: {_decode(res.stderr).strip()}")
                    lines = []
                    for ln in _decode(res.stdout).splitlines():
                        file_part, sep, rest = ln.partition(":")
                        lines.append(file_part.replace("\\", "/") + sep + rest)
                    return self._grep_result(lines, pattern)
                except subprocess.TimeoutExpired:
                    return ToolResult(False, "grep timed out after 30s; narrow the path or pattern.")
                except Exception:
                    pass  # fall back to the Python implementation

            try:
                rx = re.compile(pattern, re.IGNORECASE if ignore_case else 0)
            except re.error as e:
                return ToolResult(False, f"Invalid regex: {e}")
            files = [base] if base.is_file() else self._walk_files(base)
            lines = []
            for f in files:
                if f.suffix.lower() in BINARY_EXTS:
                    continue
                if include and not fnmatch.fnmatch(f.name, include) and not fnmatch.fnmatch(f.relative_to(self.root).as_posix(), include):
                    continue
                try:
                    if f.stat().st_size > 2_000_000:
                        continue
                    with open(f, encoding="utf-8", errors="replace") as fh:
                        for i, line in enumerate(fh, 1):
                            if rx.search(line):
                                lines.append(f"{self._rel(f)}:{i}:{line.rstrip()[:MAX_LINE_CHARS]}")
                                if len(lines) >= 300:
                                    break
                except OSError:
                    continue
                if len(lines) >= 300:
                    break
            return self._grep_result(lines, pattern)

        @R("read_file",
           "Read a text file with line numbers. For large files read a window with offset/limit. Always read a file before editing it.",
           {"path": {"type": "string", "description": "File path relative to the project root."},
            "offset": {"type": "integer", "description": "1-based line to start from (default 1)."},
            "limit": {"type": "integer", "description": f"Number of lines to read (default {READ_DEFAULT_LIMIT})."}},
           ["path"])
        def read_file(path: str, offset: int = 1, limit: int = READ_DEFAULT_LIMIT) -> ToolResult:
            p = self._resolve(path)
            if not p.exists():
                return ToolResult(False, f"File '{self._rel(p)}' does not exist.")
            if p.is_dir():
                return ToolResult(False, f"'{self._rel(p)}' is a directory; use list_dir.")
            if p.suffix.lower() in BINARY_EXTS:
                return ToolResult(False, f"'{self._rel(p)}' is a binary file.")
            text = p.read_text(encoding="utf-8", errors="replace")
            lines = text.splitlines()
            offset = max(1, int(offset or 1))
            limit = max(1, min(int(limit or READ_DEFAULT_LIMIT), 2000))
            window = lines[offset - 1: offset - 1 + limit]
            width = len(str(offset + len(window)))
            body = "\n".join(
                f"{str(i).rjust(width)}\t{(ln if len(ln) <= MAX_LINE_CHARS else ln[:MAX_LINE_CHARS] + ' …')}"
                for i, ln in enumerate(window, offset)
            )
            self._mark_read(p)
            footer = ""
            end = offset - 1 + len(window)
            if end < len(lines):
                footer = f"\n\n[Showing lines {offset}-{end} of {len(lines)}. Use offset={end + 1} to continue.]"
            if not lines:
                body = "(empty file)"
            return ToolResult(True, body + footer)

        @R("edit_file",
           "Replace an exact string in a file. old_string must match the file exactly (including indentation) and be unique "
           "unless replace_all is true; include enough surrounding lines to make it unique. Prefer this over write_file for changes.",
           {"path": {"type": "string", "description": "File path relative to the project root."},
            "old_string": {"type": "string", "description": "Exact text to replace (copy it from read_file output, without line numbers)."},
            "new_string": {"type": "string", "description": "Replacement text."},
            "replace_all": {"type": "boolean", "description": "Replace every occurrence (default false)."},
            "allow_removal": {"type": "boolean", "description": "Set true only when deleting existing functions/classes is intended."},
            "allow_test_change": {"type": "boolean", "description": "Set true only when the user asked to change existing test assertions."}},
           ["path", "old_string", "new_string"], mutating=True)
        def edit_file(path: str, old_string: str, new_string: str, replace_all: bool = False,
                      allow_removal: bool = False, allow_test_change: bool = False) -> ToolResult:
            p = self._resolve(path)
            if not p.exists():
                return ToolResult(False, f"File '{self._rel(p)}' does not exist. Use write_file to create it.")
            stale = self._check_fresh_read(p)
            if stale:
                return ToolResult(False, stale)
            text = p.read_bytes().decode("utf-8", errors="replace")
            crlf = "\r\n" in text
            norm = text.replace("\r\n", "\n")
            updated, err, note = self.apply_edit(norm, old_string, new_string, _to_bool(replace_all), self._rel(p))
            if err:
                return ToolResult(False, err)
            blocked = self._removal_guard(norm, updated, allow_removal, p, allow_test_change)
            if blocked:
                return blocked
            return self._write_edited(p, norm, updated, crlf, note)

        @R("write_file",
           "Create a new file, or completely overwrite an existing one (which must have been read first). "
           "For changes to existing files use edit_file instead.",
           {"path": {"type": "string", "description": "File path relative to the project root."},
            "content": {"type": "string", "description": "Full file content."},
            "allow_removal": {"type": "boolean", "description": "Set true only when deleting existing functions/classes is intended."},
            "allow_test_change": {"type": "boolean", "description": "Set true only when the user asked to change existing test assertions."}},
           ["path", "content"], mutating=True)
        def write_file(path: str, content: str, allow_removal: bool = False,
                       allow_test_change: bool = False) -> ToolResult:
            p = self._resolve(path)
            old = ""
            if p.exists():
                if p.is_dir():
                    return ToolResult(False, f"'{self._rel(p)}' is a directory.")
                stale = self._check_fresh_read(p)
                if stale:
                    return ToolResult(False, stale)
                old = p.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n")
            if old:
                blocked = self._removal_guard(old, content.replace("\r\n", "\n"), allow_removal, p, allow_test_change)
                if blocked:
                    return blocked
            p.parent.mkdir(parents=True, exist_ok=True)
            with open(p, "w", encoding="utf-8", newline="") as fh:
                fh.write(content)
            self._mark_read(p)
            rel = self._rel(p)
            diff = self._diff(old, content.replace("\r\n", "\n"), rel)
            n_lines = content.count("\n") + (0 if content.endswith("\n") or not content else 1)
            verb = "Overwrote" if old else "Created"
            return ToolResult(True, f"{verb} {rel} ({n_lines} lines).",
                              {"kind": "diff", "path": rel, "diff": diff, "created": not old,
                               "added": n_lines, "removed": old.count("\n") + (1 if old else 0)})

        @R("run_command",
           "Run a shell command in the project root (PowerShell on Windows, bash elsewhere): build, test, install, git, run scripts. "
           "Do not start long-running servers or interactive programs.",
           {"command": {"type": "string", "description": "The command to run."},
            "timeout": {"type": "integer", "description": "Seconds before the command is killed (default 120, max 600)."},
            "cwd": {"type": "string", "description": "Working directory relative to the project root (default '.')."}},
           ["command"], mutating=True)
        def run_command(command: str, timeout: int = 120, cwd: str = ".") -> ToolResult:
            workdir = self._resolve(cwd)
            timeout = max(5, min(int(timeout or 120), 600))
            env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1", CI="1", GIT_PAGER="cat", PAGER="cat",
                       NO_COLOR="1", FORCE_COLOR="0")
            start = time.time()
            proc = subprocess.Popen(_shell_command(command), cwd=str(workdir), stdout=subprocess.PIPE,
                                    stderr=subprocess.PIPE, stdin=subprocess.DEVNULL, env=env,
                                    creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            # Read the pipes on threads so a chatty process can't fill them and deadlock while we poll
            chunks: Dict[str, List[bytes]] = {"out": [], "err": []}

            def pump(stream, key):
                for block in iter(lambda: stream.read(4096), b""):
                    chunks[key].append(block)

            readers = [threading.Thread(target=pump, args=(proc.stdout, "out"), daemon=True),
                       threading.Thread(target=pump, args=(proc.stderr, "err"), daemon=True)]
            for r in readers:
                r.start()

            stopped_by = None
            while proc.poll() is None:
                if self.cancel.is_set():
                    stopped_by = "cancelled"
                elif time.time() - start > timeout:
                    stopped_by = "timeout"
                if stopped_by:
                    _kill_tree(proc.pid)
                    break
                time.sleep(0.1)
            for r in readers:
                r.join(timeout=2)

            out = _decode(b"".join(chunks["out"])).rstrip()
            err = _decode(b"".join(chunks["err"])).rstrip()
            out = re.sub(r"\x1b\[[0-9;?]*[A-Za-z]", "", out).replace("\r\n", "\n")
            err = re.sub(r"\x1b\[[0-9;?]*[A-Za-z]", "", err).replace("\r\n", "\n")
            parts = []
            if out:
                parts.append(out)
            if err:
                parts.append(f"[stderr]\n{err}")
            body = truncate_middle("\n".join(parts) or "(no output)")
            duration = round(time.time() - start, 1)
            if stopped_by == "timeout":
                return ToolResult(False, f"Command timed out after {timeout}s and was killed. If it is a server or "
                                         f"watcher, don't run it with run_command.\n{body}",
                                  {"kind": "command", "command": command, "exit_code": None, "timed_out": True})
            if stopped_by == "cancelled":
                return ToolResult(False, f"Command was stopped by the user.\n{body}",
                                  {"kind": "command", "command": command, "exit_code": None})
            code = proc.returncode
            return ToolResult(code == 0, f"Exit code {code} ({duration}s)\n{body}",
                              {"kind": "command", "command": command, "exit_code": code, "duration": duration})

        @R("todo_write",
           "Create or update your task plan for multi-step work. Send the complete list every time. "
           "Keep exactly one item in_progress while working; mark items completed as soon as they are done.",
           {"todos": {"type": "array", "description": "The full todo list.",
                      "items": {"type": "object",
                                "properties": {"content": {"type": "string"},
                                               "status": {"type": "string", "enum": ["pending", "in_progress", "completed"]}},
                                "required": ["content", "status"]}}},
           ["todos"])
        def todo_write(todos: Any) -> ToolResult:
            if isinstance(todos, str):
                import json
                try:
                    todos = json.loads(todos)
                except Exception:
                    return ToolResult(False, "todos must be a JSON array of {content, status}.")
            clean = []
            for item in todos or []:
                if isinstance(item, dict) and item.get("content"):
                    status = item.get("status") if item.get("status") in ("pending", "in_progress", "completed") else "pending"
                    clean.append({"content": str(item["content"])[:200], "status": status})
            self.state["todos"] = clean
            done = sum(1 for t in clean if t["status"] == "completed")
            listing = "\n".join(f"[{'x' if t['status'] == 'completed' else '>' if t['status'] == 'in_progress' else ' '}] {t['content']}" for t in clean)
            return ToolResult(True, f"Todo list updated ({done}/{len(clean)} done).\n{listing}",
                              {"kind": "todos", "todos": clean})

        @R("multi_edit",
           "Apply several exact-string edits to ONE file in a single step. Edits are applied in order and are all-or-nothing: "
           "if any edit fails, the file is left unchanged. Same matching rules as edit_file.",
           {"path": {"type": "string", "description": "File path relative to the project root."},
            "edits": {"type": "array", "description": "List of {old_string, new_string, replace_all?}.",
                      "items": {"type": "object",
                                "properties": {"old_string": {"type": "string"}, "new_string": {"type": "string"},
                                               "replace_all": {"type": "boolean"}},
                                "required": ["old_string", "new_string"]}},
            "allow_removal": {"type": "boolean", "description": "Set true only when deleting existing functions/classes is intended."},
            "allow_test_change": {"type": "boolean", "description": "Set true only when the user asked to change existing test assertions."}},
           ["path", "edits"], mutating=True)
        def multi_edit(path: str, edits: Any, allow_removal: bool = False,
                       allow_test_change: bool = False) -> ToolResult:
            p = self._resolve(path)
            if not p.is_file():
                return ToolResult(False, f"File '{self._rel(p)}' does not exist.")
            stale = self._check_fresh_read(p)
            if stale:
                return ToolResult(False, stale)
            if not isinstance(edits, list) or not edits:
                return ToolResult(False, "edits must be a non-empty array of {old_string, new_string}.")
            text = p.read_bytes().decode("utf-8", errors="replace")
            crlf = "\r\n" in text
            before = cur = text.replace("\r\n", "\n")
            notes = []
            for i, e in enumerate(edits, 1):
                if not isinstance(e, dict):
                    return ToolResult(False, f"Edit #{i} is not an object; nothing was changed.")
                cur, err, note = self.apply_edit(cur, e.get("old_string", ""), e.get("new_string", ""),
                                                 _to_bool(e.get("replace_all")), self._rel(p))
                if err:
                    return ToolResult(False, f"Edit #{i} failed, so no edits were applied: {err}")
                if note:
                    notes.append(f"#{i}")
            note = f" (edits {', '.join(notes)} matched ignoring whitespace; check the diff)" if notes else ""
            blocked = self._removal_guard(before, cur, allow_removal, p, allow_test_change)
            if blocked:
                return blocked
            return self._write_edited(p, before, cur, crlf, f", {len(edits)} edits{note}")

        @R("delete_path",
           "Delete a file, or a directory with everything in it. Use with care.",
           {"path": {"type": "string", "description": "File or folder relative to the project root."}},
           ["path"], mutating=True)
        def delete_path(path: str) -> ToolResult:
            p = self._resolve(path)
            if p == self.root:
                return ToolResult(False, "Refusing to delete the project root.")
            if not p.exists():
                return ToolResult(False, f"'{self._rel(p)}' does not exist.")
            if p.is_dir():
                count = sum(1 for _ in p.rglob("*"))
                shutil.rmtree(p)
                return ToolResult(True, f"Deleted directory {self._rel(p)} ({count} entries).")
            p.unlink()
            self.state["read_files"].pop(str(p), None)
            return ToolResult(True, f"Deleted {self._rel(p)}.")

        @R("move_path",
           "Move or rename a file or directory inside the project. Parent folders of the destination are created.",
           {"source": {"type": "string", "description": "Existing path relative to the project root."},
            "destination": {"type": "string", "description": "New path relative to the project root."}},
           ["source", "destination"], mutating=True)
        def move_path(source: str, destination: str) -> ToolResult:
            src, dst = self._resolve(source), self._resolve(destination)
            if not src.exists():
                return ToolResult(False, f"'{self._rel(src)}' does not exist.")
            if dst.exists():
                return ToolResult(False, f"'{self._rel(dst)}' already exists; delete it first or pick another name.")
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src), str(dst))
            if str(src) in self.state["read_files"]:
                self.state["read_files"][str(dst)] = self.state["read_files"].pop(str(src))
            return ToolResult(True, f"Moved {self._rel(src)} → {self._rel(dst)}.")

        @R("git",
           "Read-only git inspection: 'status', 'diff' (unstaged; set staged=true for staged), 'log' (recent commits), "
           "'show' (a commit), 'blame' (a file). To commit or change branches use run_command.",
           {"action": {"type": "string", "enum": ["status", "diff", "log", "show", "blame"]},
            "path": {"type": "string", "description": "Limit to this file or folder (optional; required for blame)."},
            "ref": {"type": "string", "description": "Commit/ref for show or log (optional)."},
            "staged": {"type": "boolean", "description": "For diff: show staged changes."},
            "limit": {"type": "integer", "description": "For log: number of commits (default 15)."}},
           ["action"])
        def git(action: str, path: Optional[str] = None, ref: Optional[str] = None, staged: bool = False,
                limit: int = 15) -> ToolResult:
            if not shutil.which("git"):
                return ToolResult(False, "git is not installed.")
            target = [self._rel(self._resolve(path))] if path else []
            ref_arg = [ref] if ref and re.fullmatch(r"[\w./~^@{}-]+", ref) else []
            cmds = {
                "status": ["git", "status", "--short", "--branch"],
                "diff": ["git", "diff", "--stat", "--patch"] + (["--staged"] if _to_bool(staged) else []) + ["--"] + target,
                "log": ["git", "log", f"-{max(1, min(int(limit or 15), 100))}", "--oneline", "--decorate"] + ref_arg + ["--"] + target,
                "show": ["git", "show", "--stat", "--patch"] + (ref_arg or ["HEAD"]),
                "blame": ["git", "blame", "--date=short", "--"] + target,
            }
            if action not in cmds:
                return ToolResult(False, f"Unknown git action '{action}'.")
            if action == "blame" and not target:
                return ToolResult(False, "blame needs a path.")
            res = subprocess.run(cmds[action], cwd=str(self.root), capture_output=True, timeout=30,
                                 creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            out = (_decode(res.stdout) or _decode(res.stderr)).rstrip() or "(no output)"
            return ToolResult(res.returncode == 0, truncate_middle(out))

        @R("check_syntax",
           "Quickly check a source file for syntax errors without running it (Python, JSON, JavaScript/TypeScript via node, YAML, TOML). "
           "Use after editing to catch mistakes early.",
           {"path": {"type": "string", "description": "File path relative to the project root."}},
           ["path"])
        def check_syntax(path: str) -> ToolResult:
            p = self._resolve(path)
            if not p.is_file():
                return ToolResult(False, f"File '{self._rel(p)}' does not exist.")
            ext = p.suffix.lower()
            src = p.read_text(encoding="utf-8", errors="replace")
            rel = self._rel(p)
            try:
                if ext in (".py", ".pyw"):
                    compile(src, rel, "exec")
                elif ext == ".json":
                    json.loads(src)
                elif ext == ".toml":
                    import tomllib
                    tomllib.loads(src)
                elif ext in (".yaml", ".yml"):
                    try:
                        import yaml
                    except ImportError:
                        return ToolResult(True, "PyYAML is not installed; YAML syntax was not checked.")
                    yaml.safe_load(src)
                elif ext in (".js", ".mjs", ".cjs"):
                    if not shutil.which("node"):
                        return ToolResult(True, "Node.js is not installed; JavaScript syntax was not checked.")
                    res = subprocess.run(["node", "--check", str(p)], capture_output=True, timeout=30,
                                         creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                    if res.returncode != 0:
                        return ToolResult(False, _decode(res.stderr).strip())
                elif ext in (".ts", ".tsx", ".jsx"):
                    return ToolResult(True, "No standalone checker for this type; run the project's type-check / build "
                                            "with run_command (e.g. npx tsc --noEmit).")
                else:
                    return ToolResult(True, f"No syntax checker for '{ext}' files.")
            except SyntaxError as e:
                return ToolResult(False, f"{rel}:{e.lineno}:{e.offset}: SyntaxError: {e.msg}\n  {(e.text or '').rstrip()}")
            except Exception as e:
                return ToolResult(False, f"{rel}: {type(e).__name__}: {e}")
            return ToolResult(True, f"{rel}: no syntax errors.")

        @R("web_fetch",
           "Fetch a web page (documentation, an API reference, a GitHub file) and return its readable text.",
           {"url": {"type": "string", "description": "http(s) URL."},
            "max_chars": {"type": "integer", "description": "Maximum characters to return (default 12000)."}},
           ["url"])
        def web_fetch(url: str, max_chars: int = 12000) -> ToolResult:
            if not re.match(r"^https?://", url or ""):
                return ToolResult(False, "url must start with http:// or https://")
            import httpx
            try:
                r = httpx.get(url, timeout=20, follow_redirects=True,
                              headers={"User-Agent": "Mozilla/5.0 (AetherCodeAgent)"})
            except Exception as e:
                return ToolResult(False, f"Request failed: {e}")
            ctype = r.headers.get("content-type", "")
            body = r.text
            if "html" in ctype:
                body = re.sub(r"(?is)<(script|style|noscript|svg|head)\b.*?</\1>", " ", body)
                body = re.sub(r"(?i)<br\s*/?>|</(p|div|li|h[1-6]|tr|pre)>", "\n", body)
                body = re.sub(r"<[^>]+>", " ", body)
                import html as _html
                body = _html.unescape(body)
                body = re.sub(r"[ \t]+", " ", body)
                body = re.sub(r"\n\s*\n+", "\n\n", body).strip()
            limit = max(500, min(int(max_chars or 12000), 40000))
            return ToolResult(r.status_code < 400, f"HTTP {r.status_code} {url}\n\n{truncate_middle(body, limit)}")

        @R("web_search",
           "Search the web (DuckDuckGo) for documentation, error messages or library usage. Returns titles, URLs and snippets; "
           "use web_fetch to read a result.",
           {"query": {"type": "string", "description": "Search query."}},
           ["query"])
        def web_search(query: str) -> ToolResult:
            try:
                from backend.app.tools.registry import registry
                fn = registry._tools.get("web_search")
                if not fn:
                    return ToolResult(False, "Web search is not available.")
                return ToolResult(True, truncate_middle(str(fn(query=query)), 6000))
            except Exception as e:
                return ToolResult(False, f"Web search failed: {e}")

    # ---------------------------------------------------------------- editing helpers
    def apply_edit(self, text: str, old_string: str, new_string: str, replace_all: bool,
                   rel: str) -> "tuple[Optional[str], Optional[str], str]":
        """Return (updated_text, error, note). Exact match first; then the two mistakes local models make
        most: literal "\\n" escapes instead of newlines, and indentation / trailing-whitespace drift."""
        old_n = (old_string or "").replace("\r\n", "\n")
        new_n = (new_string or "").replace("\r\n", "\n")
        if not old_n:
            return None, "old_string is empty. To create a file use write_file.", ""
        if old_n == new_n:
            if old_n in text:
                return None, ("No change needed: the file already contains this exact text, so this edit is already "
                              "applied. Do not repeat it; continue with the next step."), ""
            return None, "old_string and new_string are identical; nothing to change.", ""
        # Re-applying an insertion (new_string = old_string + added code) would duplicate the added code
        if old_n in new_n and text.count(new_n) and not replace_all:
            return None, ("This edit is already applied: the file already contains new_string. Do not repeat it; "
                          "re-read the file if unsure, then continue with the next step."), ""

        count = text.count(old_n)
        if count == 0 and "\n" not in old_n and "\\n" in old_n:
            unescaped_old = old_n.replace("\\n", "\n").replace("\\t", "\t")
            if text.count(unescaped_old):
                old_n, new_n = unescaped_old, new_n.replace("\\n", "\n").replace("\\t", "\t")
                count = text.count(old_n)
        if count > 1 and not replace_all:
            return None, (f"old_string occurs {count} times in '{rel}'. Add surrounding context to make it unique, "
                          "or set replace_all=true."), ""
        if count >= 1:
            return (text.replace(old_n, new_n) if replace_all else text.replace(old_n, new_n, 1)), None, ""

        matches = self._flex_matches(text, old_n)
        if len(matches) == 1:
            start, end, ref_block = matches[0]
            # The original indentation before `start` stays in place, so drop new_string's first-line indent
            replacement = self._reindent(new_n, old_n, ref_block).lstrip(" \t")
            return text[:start] + replacement + text[end:], None, \
                " (matched ignoring indentation/trailing-whitespace differences; check the diff)"
        if len(matches) > 1:
            return None, (f"old_string matches {len(matches)} places in '{rel}' when ignoring whitespace. "
                          "Add surrounding lines to make it unique."), ""
        hint = self._closest_match_hint(text, old_n)
        return None, (f"old_string was not found in '{rel}'.{hint} Re-read the file (read_file) and copy the exact "
                      "text without the line-number prefix."), ""

    @staticmethod
    def _flex_matches(text: str, old: str) -> List[tuple]:
        """Places where `old` matches when every line is compared without leading/trailing whitespace.
        Like an exact old_string, the first line may match the end of a file line and the last line the start
        of one. Returns (start, end, ref_block) with ref_block running from the first line's start, for indentation."""
        old_lines = old.strip("\n").split("\n")
        key = [ln.strip() for ln in old_lines]
        if not any(key):
            return []
        lines = text.split("\n")
        offsets, pos = [], 0
        for ln in lines:
            offsets.append(pos)
            pos += len(ln) + 1
        n = len(old_lines)
        found = []
        for i in range(len(lines) - n + 1):
            first, last = lines[i].strip(), lines[i + n - 1].strip()
            if n == 1:
                if not key[0] or key[0] not in first:
                    continue
                col = lines[i].find(key[0])
                start, end = offsets[i] + col, offsets[i] + col + len(key[0])
            else:
                if not first.endswith(key[0]) or not last.startswith(key[-1]):
                    continue
                if not all(lines[i + k].strip() == key[k] for k in range(1, n - 1)):
                    continue
                start = offsets[i] + lines[i].rfind(key[0]) if key[0] else offsets[i]
                end = offsets[i + n - 1] + lines[i + n - 1].find(key[-1]) + len(key[-1])
            found.append((start, end, text[offsets[i]:end]))
        return found

    @staticmethod
    def _reindent(new: str, old: str, block: str) -> str:
        """Rewrite new_string's indentation in the file's style. Models often get both the base indent and the
        indent width wrong (2 spaces where the file uses 4), so map indentation *levels*, not raw offsets."""
        def width(ln: str) -> int:
            lead = ln[: len(ln) - len(ln.lstrip())]
            return len(lead.replace("\t", "    "))

        def base_and_unit(text: str):
            ws = [width(ln) for ln in text.split("\n") if ln.strip()]
            if not ws:
                return 0, 0
            base = ws[0]
            steps = sorted({w - base for w in ws if w - base > 0})
            return base, (steps[0] if steps else 0)

        old_s, new_s = old.strip("\n"), new.strip("\n")
        # Pair each line the model wrote with the file line it matched: "model's 4 spaces" -> "file's 8 spaces".
        # This copes with inconsistent indentation inside old_string; level scaling covers widths not seen here.
        table: Dict[int, int] = {}
        old_lines, blk_lines = old_s.split("\n"), block.split("\n")
        if len(old_lines) == len(blk_lines):
            for o, b in zip(old_lines, blk_lines):
                if o.strip():
                    table.setdefault(width(o), width(b))
        old_base, old_unit = base_and_unit(old_s)
        real_base, real_unit = base_and_unit(block)
        use_tabs = any(ln.startswith("\t") for ln in block.split("\n"))
        if not real_unit:
            real_unit = old_unit or 4
        if not old_unit:
            old_unit = real_unit
        if all(k == v for k, v in table.items()) and old_base == real_base and old_unit == real_unit:
            return new_s
        out = []
        for ln in new_s.split("\n"):
            if not ln.strip():
                out.append("")
                continue
            w = width(ln)
            if w in table:
                cols = table[w]
            else:
                cols = real_base + int(round(max(0.0, (w - old_base) / old_unit))) * real_unit
            indent = ("\t" * (cols // 4) + " " * (cols % 4)) if use_tabs else " " * cols
            out.append(indent + ln.lstrip())
        return "\n".join(out)

    _ASSERT_RE = re.compile(r"\b(assert\w*|expect\s*\(|should\.|\.to(Be|Equal)\b|assert_eq!?)")
    _TEST_PATH_RE = re.compile(r"(^|/)(tests?|__tests__|spec)/|(^|/)test_[^/]*$|_test\.\w+$|\.(test|spec)\.\w+$", re.I)

    def _removal_guard(self, before: str, after: str, allow: Any, path: Optional[Path] = None,
                       allow_test_change: Any = False) -> Optional[ToolResult]:
        """Mechanical guards for what small models do to "make it work":
        - "adding" a function by replacing a neighbouring one, deleting working code;
        - editing existing test assertions to match buggy code instead of fixing the code."""
        lost = sorted(set(self._DEF_RE.findall(before)) - set(self._DEF_RE.findall(after)))
        if lost and not _to_bool(allow):
            return ToolResult(False, f"Edit rejected (file unchanged): it would delete existing definition(s): {', '.join(lost)}. "
                                     "To ADD code, keep the existing definition in new_string and put the new code before or after it. "
                                     "If deleting is really intended, repeat the call with allow_removal=true.")
        if path is not None and not _to_bool(allow_test_change) and self._TEST_PATH_RE.search(self._rel(path)):
            after_lines = {ln.strip() for ln in after.split("\n")}
            changed = [ln.strip() for ln in before.split("\n")
                       if self._ASSERT_RE.search(ln) and ln.strip() not in after_lines]
            if changed:
                return ToolResult(False, "Edit rejected (file unchanged): it modifies or removes existing test assertion(s): "
                                         f"{changed[0][:120]!r}. Tests define the expected behaviour — fix the code under test "
                                         "instead. Adding new tests is fine. Only if the user asked to change these assertions, "
                                         "repeat the call with allow_test_change=true.")
        return None

    _DEF_RE = re.compile(r"^\s*(?:async\s+def|def|class|function|func|fn|(?:export\s+)?(?:async\s+)?function)\s+([A-Za-z_]\w*)", re.M)

    def _write_edited(self, p: Path, before: str, after: str, crlf: bool, note: str = "") -> ToolResult:
        p.write_bytes((after.replace("\n", "\r\n") if crlf else after).encode("utf-8"))
        self._mark_read(p)
        rel = self._rel(p)
        diff = self._diff(before, after, rel)
        added = sum(1 for ln in diff.splitlines() if ln.startswith("+") and not ln.startswith("+++"))
        removed = sum(1 for ln in diff.splitlines() if ln.startswith("-") and not ln.startswith("---"))
        return ToolResult(True, f"Edited {rel} (+{added} -{removed}){note}.\n{truncate_middle(diff, 4000)}",
                          {"kind": "diff", "path": rel, "diff": diff, "added": added, "removed": removed})

    def preview(self, name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """What a mutating call would do, for the approval card (same logic as the real tool)."""
        name = self.canonical_name(name, args)
        args = self._normalize_args(name, args)
        if name == "run_command":
            return {"kind": "command", "command": args.get("command", ""), "cwd": args.get("cwd", ".")}
        if name == "delete_path":
            return {"kind": "action", "text": f"delete {args.get('path', '')}"}
        if name == "move_path":
            return {"kind": "action", "text": f"move {args.get('source', '')} → {args.get('destination', '')}"}
        try:
            p = self._resolve(args.get("path"))
            rel = self._rel(p)
            old = p.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n") if p.is_file() else ""
        except Exception as e:
            return {"kind": "action", "text": str(e)}
        new = old
        if name == "edit_file":
            new, err, _ = self.apply_edit(old, args.get("old_string", ""), args.get("new_string", ""),
                                          _to_bool(args.get("replace_all")), rel)
            if err:
                return {"kind": "action", "text": f"{rel}: {err}"}
        elif name == "multi_edit":
            for e in args.get("edits") or []:
                if not isinstance(e, dict):
                    continue
                new, err, _ = self.apply_edit(new, e.get("old_string", ""), e.get("new_string", ""),
                                              _to_bool(e.get("replace_all")), rel)
                if err:
                    return {"kind": "action", "text": f"{rel}: {err}"}
        elif name == "write_file":
            new = (args.get("content") or "").replace("\r\n", "\n")
        return {"kind": "diff", "path": rel, "diff": self._diff(old, new, rel), "created": not p.exists()}

    def _grep_result(self, lines: List[str], pattern: str) -> ToolResult:
        if not lines:
            return ToolResult(True, f"No matches for '{pattern}'.")
        more = ""
        if len(lines) > 200:
            more = f"\n... {len(lines) - 200} more matches; narrow the search."
            lines = lines[:200]
        return ToolResult(True, "\n".join(lines) + more)

    @staticmethod
    def _closest_match_hint(text: str, needle: str) -> str:
        first = next((ln.strip() for ln in needle.splitlines() if ln.strip()), "")
        if not first:
            return ""
        for i, ln in enumerate(text.splitlines(), 1):
            if first in ln.strip() or ln.strip() in first and len(ln.strip()) > 10:
                return f" A similar line exists at line {i}: {ln.strip()[:120]!r}."
        return ""

    # ---------------------------------------------------------------- dispatch
    def schemas(self) -> List[Dict[str, Any]]:
        return [s.schema() for s in self.specs.values()]

    # Names local models reach for when they guess instead of using the provided schema
    TOOL_ALIASES = {
        "bash": "run_command", "shell": "run_command", "execute": "run_command", "exec": "run_command",
        "run": "run_command", "terminal": "run_command", "execute_command": "run_command", "bash_executor": "run_command",
        "cat": "read_file", "view": "read_file", "open_file": "read_file", "view_file": "read_file",
        "ls": "list_dir", "list_files": "list_dir", "list_directory": "list_dir", "tree": "list_dir",
        "search": "grep", "search_files": "grep", "find_in_files": "grep", "rg": "grep",
        "find": "glob", "find_files": "glob", "search_file_names": "glob",
        "str_replace": "edit_file", "replace_in_file": "edit_file", "apply_edit": "edit_file", "str_replace_editor": "edit_file",
        "create_file": "write_file", "save_file": "write_file",
        "rm": "delete_path", "delete_file": "delete_path", "remove_file": "delete_path",
        "mv": "move_path", "rename": "move_path", "rename_file": "move_path", "move_file": "move_path",
        "todo": "todo_write", "update_todos": "todo_write", "plan": "todo_write",
        "fetch": "web_fetch", "read_url": "web_fetch", "browse": "web_fetch",
    }
    ARG_ALIASES = (("file_path", "path"), ("filepath", "path"), ("filename", "path"), ("file", "path"),
                   ("directory", "path"), ("dir", "path"), ("cmd", "command"), ("old_str", "old_string"),
                   ("new_str", "new_string"), ("old", "old_string"), ("new", "new_string"), ("text", "content"),
                   ("code", "content"), ("query", "pattern"), ("regex", "pattern"), ("src", "source"),
                   ("from", "source"), ("dest", "destination"), ("to", "destination"), ("link", "url"))

    def resolve_name(self, name: str) -> str:
        n = (name or "").strip()
        if n in self.specs:
            return n
        n = n.lower().replace("-", "_").split(".")[-1]
        return n if n in self.specs else self.TOOL_ALIASES.get(n, n)

    def _normalize_args(self, name: str, args: Any) -> Dict[str, Any]:
        spec = self.specs.get(name)
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except Exception:
                args = {}
        if not isinstance(args, dict) or not spec:
            return args if isinstance(args, dict) else {}
        clean = {k: v for k, v in args.items() if k in spec.parameters}
        for alias, target in self.ARG_ALIASES:
            if alias in args and target in spec.parameters and target not in clean:
                clean[target] = args[alias]
        # file_system-style calls: {"action": "read", "path": ...}
        if name == "write_file" and "content" not in clean and "contents" in args:
            clean["content"] = args["contents"]
        return {k: _coerce(v, spec.parameters.get(k, {})) for k, v in clean.items()}

    def canonical_name(self, name: str, args: Any = None) -> str:
        if (name or "").lower() == "file_system" and isinstance(args, dict):
            action = str(args.get("action", "read")).lower()
            return {"write": "write_file", "list": "list_dir", "delete": "delete_path"}.get(action, "read_file")
        return self.resolve_name(name)

    def execute(self, name: str, args: Any) -> ToolResult:
        name = self.canonical_name(name, args)
        spec = self.specs.get(name)
        if not spec:
            return ToolResult(False, f"Unknown tool '{name}'. Available tools: {', '.join(self.specs)}.")
        clean = self._normalize_args(name, args)
        missing = [r for r in spec.required if r not in clean or clean[r] is None]
        if missing:
            return ToolResult(False, f"Missing required argument(s) for {name}: {', '.join(missing)}. "
                                     f"Expected parameters: {', '.join(spec.parameters)}.")
        try:
            return spec.fn(**clean)
        except ValueError as e:
            return ToolResult(False, str(e))
        except Exception as e:
            return ToolResult(False, f"{name} failed: {type(e).__name__}: {e}")

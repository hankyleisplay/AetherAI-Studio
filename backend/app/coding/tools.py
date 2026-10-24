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
import locale
import os
import platform
import re
import shutil
import subprocess
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
            "replace_all": {"type": "boolean", "description": "Replace every occurrence (default false)."}},
           ["path", "old_string", "new_string"], mutating=True)
        def edit_file(path: str, old_string: str, new_string: str, replace_all: bool = False) -> ToolResult:
            p = self._resolve(path)
            if not p.exists():
                return ToolResult(False, f"File '{self._rel(p)}' does not exist. Use write_file to create it.")
            stale = self._check_fresh_read(p)
            if stale:
                return ToolResult(False, stale)
            if old_string == new_string:
                return ToolResult(False, "old_string and new_string are identical; nothing to change.")
            raw = p.read_bytes()
            text = raw.decode("utf-8", errors="replace")
            crlf = "\r\n" in text
            norm = text.replace("\r\n", "\n")
            old_n = old_string.replace("\r\n", "\n")
            new_n = new_string.replace("\r\n", "\n")
            count = norm.count(old_n)
            if count == 0:
                hint = self._closest_match_hint(norm, old_n)
                return ToolResult(False, f"old_string was not found in '{self._rel(p)}'.{hint} "
                                         "Re-read the file and copy the exact text, including whitespace.")
            if count > 1 and not replace_all:
                return ToolResult(False, f"old_string occurs {count} times in '{self._rel(p)}'. Add surrounding "
                                         "context to make it unique, or set replace_all=true.")
            updated = norm.replace(old_n, new_n) if replace_all else norm.replace(old_n, new_n, 1)
            out = updated.replace("\n", "\r\n") if crlf else updated
            p.write_bytes(out.encode("utf-8"))
            self._mark_read(p)
            rel = self._rel(p)
            diff = self._diff(norm, updated, rel)
            added = sum(1 for ln in diff.splitlines() if ln.startswith("+") and not ln.startswith("+++"))
            removed = sum(1 for ln in diff.splitlines() if ln.startswith("-") and not ln.startswith("---"))
            return ToolResult(True, f"Edited {rel} (+{added} -{removed}).\n{truncate_middle(diff, 4000)}",
                              {"kind": "diff", "path": rel, "diff": diff, "added": added, "removed": removed})

        @R("write_file",
           "Create a new file, or completely overwrite an existing one (which must have been read first). "
           "For changes to existing files use edit_file instead.",
           {"path": {"type": "string", "description": "File path relative to the project root."},
            "content": {"type": "string", "description": "Full file content."}},
           ["path", "content"], mutating=True)
        def write_file(path: str, content: str) -> ToolResult:
            p = self._resolve(path)
            old = ""
            if p.exists():
                if p.is_dir():
                    return ToolResult(False, f"'{self._rel(p)}' is a directory.")
                stale = self._check_fresh_read(p)
                if stale:
                    return ToolResult(False, stale)
                old = p.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n")
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
            if IS_WINDOWS:
                shell_cmd = ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
                             "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; " + command]
            else:
                shell_cmd = ["/bin/bash", "-lc", command]
            env = dict(os.environ, PYTHONIOENCODING="utf-8", PYTHONUTF8="1", CI="1", GIT_PAGER="cat", PAGER="cat")
            start = time.time()
            try:
                res = subprocess.run(shell_cmd, cwd=str(workdir), capture_output=True, timeout=timeout,
                                     stdin=subprocess.DEVNULL, env=env,
                                     creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            except subprocess.TimeoutExpired as e:
                partial = _decode(e.stdout) + _decode(e.stderr)
                return ToolResult(False, f"Command timed out after {timeout}s.\n{truncate_middle(partial)}",
                                  {"kind": "command", "command": command, "exit_code": None, "timed_out": True})
            out = _decode(res.stdout).rstrip()
            err = _decode(res.stderr).rstrip()
            parts = []
            if out:
                parts.append(out)
            if err:
                parts.append(f"[stderr]\n{err}")
            body = truncate_middle("\n".join(parts) or "(no output)")
            duration = round(time.time() - start, 1)
            return ToolResult(res.returncode == 0, f"Exit code {res.returncode} ({duration}s)\n{body}",
                              {"kind": "command", "command": command, "exit_code": res.returncode, "duration": duration})

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

    def execute(self, name: str, args: Dict[str, Any]) -> ToolResult:
        spec = self.specs.get(name)
        if not spec:
            return ToolResult(False, f"Unknown tool '{name}'. Available: {', '.join(self.specs)}.")
        if not isinstance(args, dict):
            return ToolResult(False, "Tool arguments must be a JSON object.")
        allowed = set(spec.parameters)
        clean = {k: v for k, v in args.items() if k in allowed}
        # Common aliases local models use
        for alias, target in (("file_path", "path"), ("filename", "path"), ("file", "path"), ("cmd", "command"),
                              ("old_str", "old_string"), ("new_str", "new_string"), ("text", "content")):
            if alias in args and target in allowed and target not in clean:
                clean[target] = args[alias]
        missing = [r for r in spec.required if r not in clean]
        if missing:
            return ToolResult(False, f"Missing required argument(s) for {name}: {', '.join(missing)}.")
        try:
            return spec.fn(**clean)
        except ValueError as e:
            return ToolResult(False, str(e))
        except Exception as e:
            return ToolResult(False, f"{name} failed: {type(e).__name__}: {e}")

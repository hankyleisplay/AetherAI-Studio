import os
import sys
import json
import time
import asyncio
import inspect
import re
import locale
import httpx
import subprocess
import platform
import psutil
from datetime import datetime, timezone as dt_timezone
from pathlib import Path
from typing import Dict, Any, List, Callable, Optional
from pydantic import BaseModel
from backend.app.config import settings


def _decode_subprocess_bytes(data: Optional[bytes]) -> str:
    if not data:
        return ""
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        enc = locale.getpreferredencoding(False) or "utf-8"
        return data.decode(enc, errors="replace")


class ToolParameter(BaseModel):
    type: str = "string"
    description: str = ""
    enum: Optional[List[str]] = None
    default: Optional[Any] = None

class ToolDefinition(BaseModel):
    name: str
    description: str
    parameters: Dict[str, Any]
    required: List[str] = []
    enabled: bool = True

class ToolRegistry:
    def __init__(self):
        self._tools: Dict[str, Callable] = {}
        self._definitions: Dict[str, ToolDefinition] = {}

    def register(self, name: str, description: str, parameters: Dict[str, Any], required: List[str] = None):
        def decorator(func: Callable):
            self._tools[name] = func
            self._definitions[name] = ToolDefinition(
                name=name,
                description=description,
                parameters=parameters,
                required=required or list(parameters.keys()),
                enabled=True
            )
            return func
        return decorator

    def get_definitions(self, enabled_only: bool = True) -> List[Dict[str, Any]]:
        result = []
        for name, defn in self._definitions.items():
            if enabled_only and not defn.enabled:
                continue
            result.append({
                "type": "function",
                "function": {
                    "name": defn.name,
                    "description": defn.description,
                    "parameters": {
                        "type": "object",
                        "properties": defn.parameters,
                        "required": defn.required
                    }
                }
            })
        return result

    def get_raw_definitions(self) -> List[Dict[str, Any]]:
        return [defn.model_dump() for defn in self._definitions.values()]

    def set_tool_enabled(self, name: str, enabled: bool):
        if name in self._definitions:
            self._definitions[name].enabled = enabled

    def load_persisted_state(self, disabled_tools: List[str]):
        """Sync enabled states with persistent database settings."""
        disabled_set = set(disabled_tools or [])
        for name, defn in self._definitions.items():
            defn.enabled = name not in disabled_set

    async def execute(self, name: str, args: Any) -> Dict[str, Any]:
        if name not in self._tools:
            return {"success": False, "error": f"Tool '{name}' not found."}
        
        defn = self._definitions.get(name)
        if defn and not defn.enabled:
            err_msg = f"❌ 【工具停用攔截】：工具 '{name}' 目前已被使用者或系統設定停用。你目前完全無法使用此工具，請明確向使用者說明此工具已被停用，切勿宣稱能執行它。"
            return {
                "success": False,
                "error": err_msg,
                "output": err_msg,
                "duration_seconds": 0
            }

        func = self._tools[name]
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except Exception:
                args = {"query": args} if name == "web_search" else {"input": args}
        if not isinstance(args, dict):
            args = {}
        try:
            start_time = time.time()
            if inspect.iscoroutinefunction(func):
                res = await func(**args)
            else:
                # Blocking tools (shell, Python sandbox, OCR, web requests) would otherwise freeze the
                # event loop, stalling every other chat stream and API call until they finish.
                res = await asyncio.to_thread(func, **args)
            duration = round(time.time() - start_time, 3)
            return {
                "success": True,
                "output": res,
                "duration_seconds": duration
            }
        except Exception as e:
            err_msg = f"Execution error in {name}: {str(e)}"
            return {
                "success": False,
                "error": err_msg,
                "output": err_msg,
                "duration_seconds": round(time.time() - start_time, 3) if 'start_time' in locals() else 0
            }

registry = ToolRegistry()

# ================= Built-in Tools =================

_SEARCH_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
}

def _search_duckduckgo_html(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    from lxml.html import document_fromstring
    from urllib.parse import unquote
    results = []
    with httpx.Client(timeout=8.0, follow_redirects=True, headers=_SEARCH_HEADERS) as client:
        resp = client.post("https://html.duckduckgo.com/html/", data={"q": query})
        if resp.status_code != 200:
            return []
        tree = document_fromstring(resp.text)
        for r in tree.xpath("//div[contains(@class, 'result__body')]"):
            h2_a = r.xpath(".//h2//a")
            if not h2_a:
                continue
            title = "".join(h2_a[0].itertext()).strip()
            raw_href = h2_a[0].get("href", "").strip()

            href = raw_href
            if "uddg=" in raw_href:
                try:
                    part = raw_href.split("uddg=")[1].split("&")[0]
                    href = unquote(part)
                except Exception:
                    pass
            elif raw_href.startswith("//"):
                href = "https:" + raw_href

            snippet_nodes = r.xpath(".//a[contains(@class, 'result__snippet')]")
            snippet = "".join(snippet_nodes[0].itertext()).strip() if snippet_nodes else ""

            if href and title:
                results.append({"title": title, "href": href, "body": snippet})
                if len(results) >= max_results:
                    break
    return results

def _search_bing_direct(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    import base64
    from urllib.parse import urlparse, parse_qs
    from lxml.html import document_fromstring
    results = []
    cache = set()
    with httpx.Client(timeout=8.0, follow_redirects=True, headers=_SEARCH_HEADERS) as client:
        resp = client.get("https://www.bing.com/search", params={"q": query})
        if resp.status_code != 200:
            return []
        tree = document_fromstring(resp.text)
        for li in tree.xpath("//li[contains(@class, 'b_algo')]"):
            h2 = li.xpath(".//h2")
            if not h2:
                continue
            a_tags = h2[0].xpath(".//a[@href]")
            if not a_tags:
                continue
            a = a_tags[0]
            href = a.get("href", "").strip()
            title = "".join(a.itertext()).strip()

            if href and "bing.com/ck/a?" in href:
                u_param = parse_qs(urlparse(href).query).get("u", [""])[0]
                if u_param and len(u_param) > 2:
                    try:
                        b = u_param[2:]
                        decoded = base64.urlsafe_b64decode(b + "=" * ((-len(b)) % 4)).decode("utf-8", errors="ignore")
                        if decoded.startswith("http"):
                            href = decoded
                    except Exception:
                        pass

            snippet_parts = []
            for p in li.xpath(".//div[contains(@class, 'b_caption')]//p | .//p"):
                text = "".join(p.itertext()).strip()
                if text:
                    snippet_parts.append(text)
            body = " ".join(snippet_parts).strip()

            if href and title and href not in cache:
                cache.add(href)
                results.append({"title": title, "href": href, "body": body})
                if len(results) >= max_results:
                    break
    return results

def _search_duckduckgo_lite(query: str, max_results: int = 5) -> List[Dict[str, str]]:
    from lxml.html import document_fromstring
    results = []
    with httpx.Client(timeout=8.0, follow_redirects=True, headers=_SEARCH_HEADERS) as client:
        resp = client.post("https://lite.duckduckgo.com/lite/", data={"q": query})
        if resp.status_code != 200:
            return []
        tree = document_fromstring(resp.text)
        tables = tree.xpath("//table")
        if len(tables) >= 3:
            links = tables[2].xpath(".//a[contains(@class, 'result-link')]")
            snippets = tables[2].xpath(".//td[contains(@class, 'result-snippet')]")
            for idx, a in enumerate(links):
                href = a.get("href", "")
                title = "".join(a.itertext()).strip()
                body = "".join(snippets[idx].itertext()).strip() if idx < len(snippets) else ""
                if href and title:
                    results.append({"title": title, "href": href, "body": body})
                    if len(results) >= max_results:
                        break
    return results

@registry.register(
    name="web_search",
    description="Search the web for real-time information, news, documentation or answers using DuckDuckGo & Bing.",
    parameters={
        "query": {"type": "string", "description": "The search query keywords."},
        "max_results": {"type": "integer", "description": "Number of results to return (default: 5)."}
    },
    required=["query"]
)
def web_search(query: str = "", max_results: int = 5, **kwargs) -> str:
    # Resolve parameter aliases from various LLMs (query, q, keywords, search_query, input)
    clean_query = str(
        query
        or kwargs.get("q")
        or kwargs.get("keywords")
        or kwargs.get("keyword")
        or kwargs.get("search_query")
        or kwargs.get("text")
        or kwargs.get("input")
        or ""
    ).strip()

    if not clean_query:
        return "Search failed: Empty search query provided."

    results: List[Dict[str, str]] = []
    errors: List[str] = []

    # 1. Primary Engine: DuckDuckGo HTML
    try:
        results = _search_duckduckgo_html(clean_query, max_results=max_results)
    except Exception as e:
        errors.append(f"DDG-HTML: {str(e)}")

    # 2. Secondary Engine: Bing Direct
    if not results:
        try:
            results = _search_bing_direct(clean_query, max_results=max_results)
        except Exception as e:
            errors.append(f"Bing: {str(e)}")

    # 3. Tertiary Engine: DuckDuckGo Lite
    if not results:
        try:
            results = _search_duckduckgo_lite(clean_query, max_results=max_results)
        except Exception as e:
            errors.append(f"DDG-Lite: {str(e)}")

    # 4. Quaternary Engine: ddgs / duckduckgo_search library
    if not results:
        try:
            from duckduckgo_search import DDGS
            with DDGS() as ddgs:
                ddg_list = list(ddgs.text(clean_query, max_results=max_results))
                if ddg_list:
                    for item in ddg_list:
                        results.append({
                            "title": item.get("title", ""),
                            "href": item.get("href", ""),
                            "body": item.get("body", "")
                        })
        except Exception as e:
            errors.append(f"DDGS: {str(e)}")

    if not results:
        err_detail = f" ({'; '.join(errors)})" if errors else ""
        return f"No search results found for query: '{clean_query}'.{err_detail}"

    formatted = []
    for i, r in enumerate(results, 1):
        title = r.get("title", "").replace("\xa0", " ").strip()
        href = r.get("href", "").strip()
        body = r.get("body", "").replace("\xa0", " ").strip()
        formatted.append(f"[{i}] {title}\nURL: {href}\nSnippet: {body}\n")

    return "\n".join(formatted)

@registry.register(
    name="python_eval",
    description="Execute Python code in an isolated subprocess. Useful for mathematical calculations, data parsing, algorithms, and logic verification. Output (stdout/stderr) will be returned.",
    parameters={
        "code": {"type": "string", "description": "Valid Python code to execute. Can print outputs."}
    },
    required=["code"]
)
def python_eval(code: str) -> str:
    try:
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"
        res = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15,
            cwd=str(settings.workspace_dir),
            env=env
        )
        out = res.stdout.strip()
        err = res.stderr.strip()
        if res.returncode != 0:
            return f"Process failed (Exit code {res.returncode}):\n{err if err else out}"
        return out if out else "(Executed successfully with no stdout output)"
    except subprocess.TimeoutExpired:
        return "Execution timed out after 15 seconds."
    except Exception as e:
        return f"Python execution error: {str(e)}"

@registry.register(
    name="bash_executor",
    description="Execute a shell command inside the workspace directory. Useful for inspecting directory files, running system commands, git, etc.",
    parameters={
        "command": {"type": "string", "description": "The bash shell command to execute."}
    },
    required=["command"]
)
def bash_executor(command: str) -> str:
    if not settings.enable_shell:
        return "Shell command execution is disabled by the administrator configuration."
    # Security: block obvious dangerous commands
    dangerous = ["rm -rf /", "mkfs", ":(){ :|:& };:", "dd if=/dev/"]
    for d in dangerous:
        if d in command:
            return f"Command rejected: contains dangerous pattern '{d}'."
    try:
        res = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            timeout=30,
            cwd=str(settings.workspace_dir)
        )
        out = _decode_subprocess_bytes(res.stdout).strip()
        err = _decode_subprocess_bytes(res.stderr).strip()
        output = []
        if out:
            output.append(out)
        if err:
            output.append(f"[stderr]\n{err}")
        if not output:
            output.append("(Command finished with no output)")
        return "\n".join(output)
    except subprocess.TimeoutExpired:
        return "Command timed out after 30 seconds."
    except Exception as e:
        return f"Shell execution error: {str(e)}"

@registry.register(
    name="file_system",
    description="Read, write, list or delete files in the agent workspace. All paths are relative to the workspace directory.",
    parameters={
        "action": {
            "type": "string",
            "enum": ["read", "write", "list", "delete"],
            "description": "The file operation to perform ('read', 'write', 'list', 'delete')."
        },
        "path": {
            "type": "string",
            "description": "Relative path of the file or directory inside workspace."
        },
        "content": {
            "type": "string",
            "description": "Text content to write (required only for 'write' action)."
        }
    },
    required=["action", "path"]
)
def file_system(
    action: Optional[str] = None,
    path: Optional[str] = None,
    content: Optional[str] = None,
    **kwargs: Any
) -> str:
    """Read, write, list or delete files safely within the agent workspace."""
    # 1. Resolve action aliases
    act = (action or kwargs.get("operation") or kwargs.get("op") or kwargs.get("mode") or "").strip().lower()
    if act in ["write", "write_file", "save", "save_file", "create", "create_file", "append", "update"]:
        act = "write"
    elif act in ["read", "read_file", "view", "cat", "get", "load"]:
        act = "read"
    elif act in ["list", "list_files", "ls", "dir", "browse"]:
        act = "list"
    elif act in ["delete", "delete_file", "remove", "rm", "del", "unlink"]:
        act = "delete"
    else:
        # Fallback heuristic: if content is provided, action is write; if path is empty/dot, action is list; otherwise read
        if content is not None or "data" in kwargs or "text" in kwargs or "code" in kwargs:
            act = "write"
        elif not path or path in (".", "/", "\\"):
            act = "list"
        else:
            act = "read"

    # 2. Resolve path aliases
    resolved_path = (
        path
        or kwargs.get("file_path")
        or kwargs.get("filePath")
        or kwargs.get("filename")
        or kwargs.get("file")
        or kwargs.get("target")
        or kwargs.get("directory")
        or kwargs.get("dir")
        or ""
    )
    if not isinstance(resolved_path, str):
        resolved_path = str(resolved_path)

    # 3. Resolve content aliases
    if content is None:
        content = (
            kwargs.get("data")
            or kwargs.get("text")
            or kwargs.get("file_content")
            or kwargs.get("body")
            or kwargs.get("code")
            or ""
        )

    base = settings.workspace_dir.resolve()

    # 4. Clean path & Prevent Windows / root path escaping
    clean_p = resolved_path.strip().replace("\\", "/")
    if Path(clean_p).is_absolute():
        target = Path(clean_p).resolve()
    else:
        while clean_p.startswith("/"):
            clean_p = clean_p[1:]
        if clean_p.lower().startswith("workspace/"):
            clean_p = clean_p[10:]
        while clean_p.startswith("./"):
            clean_p = clean_p[2:]
        target = (base / clean_p).resolve() if clean_p else base

    # Path traversal check
    if not str(target).startswith(str(base)):
        return f"Access Denied: Path '{resolved_path}' escapes workspace directory."

    display_rel = str(target.relative_to(base)).replace("\\", "/") if target != base else "."

    try:
        if act == "read":
            if not target.exists():
                fallback = (settings.base_workspace_dir / clean_p).resolve()
                if fallback.exists() and fallback.is_file():
                    target = fallback
                else:
                    return f"File '{display_rel}' does not exist in workspace."
            if not target.is_file():
                return f"Path '{display_rel}' is a directory, not a file. Use action='list' to inspect directory contents."
            return target.read_text(encoding="utf-8", errors="replace")

        elif act == "write":
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content or "", encoding="utf-8")
            return f"Successfully saved {len(content or '')} characters to workspace file '{display_rel}'."

        elif act == "list":
            if not target.exists():
                return f"Directory '{display_rel}' does not exist."
            if not target.is_dir():
                return f"Path '{display_rel}' is a file, not a directory."
            items = []
            for item in sorted(target.iterdir()):
                rel = item.relative_to(base).as_posix()
                prefix = "[DIR] " if item.is_dir() else "[FILE]"
                size = f"({item.stat().st_size} bytes)" if item.is_file() else ""
                items.append(f"{prefix} {rel} {size}")
            return "\n".join(items) if items else f"(Directory '{display_rel}' is empty)"

        elif act == "delete":
            if not target.exists():
                return f"Path '{display_rel}' does not exist."
            if target == base:
                return "Cannot delete the root workspace directory."
            if target.is_file():
                target.unlink()
                return f"File '{display_rel}' deleted from workspace."
            elif target.is_dir():
                import shutil
                shutil.rmtree(target)
                return f"Directory '{display_rel}' and all contents deleted."

        else:
            return f"Unknown action: '{act}'. Must be one of ['read', 'write', 'list', 'delete']."

    except Exception as e:
        return f"File system error: {str(e)}"

@registry.register(
    name="system_status",
    description="Inspect host system resources (CPU, Memory, Disk, Platform OS, Python environment).",
    parameters={},
    required=[]
)
def system_status() -> str:
    try:
        cpu_pct = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        disk = psutil.disk_usage(str(settings.workspace_dir))
        
        info = [
            f"OS: {platform.system()} {platform.release()} ({platform.machine()})",
            f"Python: {platform.python_version()}",
            f"CPU Usage: {cpu_pct}% ({psutil.cpu_count(logical=True)} logical cores)",
            f"Memory: {round(mem.used / (1024**3), 2)} GB / {round(mem.total / (1024**3), 2)} GB ({mem.percent}%)",
            f"Workspace Disk Free: {round(disk.free / (1024**3), 2)} GB ({100 - disk.percent}% available)"
        ]
        return "\n".join(info)
    except Exception as e:
        return f"Error gathering system info: {str(e)}"

@registry.register(
    name="datetime_calc",
    description="Get current date, time, weekday, UTC timestamp, or evaluate date differences.",
    parameters={
        "timezone": {"type": "string", "description": "Optional timezone name like 'Asia/Taipei', 'UTC', 'America/New_York' (default: local)."}
    },
    required=[]
)
def datetime_calc(timezone: Optional[str] = None) -> str:
    now = datetime.now()
    now_utc = datetime.now(dt_timezone.utc)
    lines = [
        f"Current Local Time: {now.strftime('%Y-%m-%d %H:%M:%S %A')}",
        f"Current UTC Time: {now_utc.strftime('%Y-%m-%d %H:%M:%S UTC')}",
        f"ISO Timestamp: {now.isoformat()}"
    ]
    if timezone:
        try:
            from zoneinfo import ZoneInfo
            tz_now = datetime.now(ZoneInfo(timezone))
            lines.append(f"Requested Timezone ({timezone}): {tz_now.strftime('%Y-%m-%d %H:%M:%S %Z')}")
        except Exception:
            pass
    return "\n".join(lines)

@registry.register(
    name="read_url",
    description="Fetch and extract readable plain text content from a web URL (HTTP/HTTPS).",
    parameters={
        "url": {"type": "string", "description": "The web URL to scrape and read."},
        "max_length": {"type": "integer", "description": "Max text length to return (default: 4000)."}
    },
    required=["url"]
)
async def read_url(url: str, max_length: int = 4000) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    timeout = httpx.Timeout(12.0)
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                return f"Failed to fetch {url} (HTTP {resp.status_code})"
            
            html = resp.text
            # Remove scripts, styles, and comments
            html = re.sub(r'<(script|style|header|footer|nav)[\s\S]*?</\1>', ' ', html, flags=re.IGNORECASE)
            html = re.sub(r'<!--[\s\S]*?-->', ' ', html)
            # Remove all HTML tags
            text = re.sub(r'<[^>]+>', ' ', html)
            # Clean excessive whitespace
            text = re.sub(r'\s+', ' ', text).strip()
            if not text:
                return f"Fetched {url} successfully but no readable text was extracted."
            if len(text) > max_length:
                return text[:max_length] + f"\n... [Truncated, total {len(text)} characters]"
            return text
    except Exception as e:
        return f"Error reading URL {url}: {str(e)}"

@registry.register(
    name="knowledge_memory",
    description="Manage persistent long-term memory across chat sessions. Actions: 'store' to remember a fact/preference/rule, 'search' to find memories by keywords, 'list' to view recent memories.",
    parameters={
        "action": {
            "type": "string",
            "enum": ["store", "search", "list"],
            "description": "Operation to perform on memory."
        },
        "key": {"type": "string", "description": "Short memory title or topic identifier (for 'store')."},
        "content": {"type": "string", "description": "The detailed fact, instruction or insight to remember (for 'store')."},
        "query": {"type": "string", "description": "Keywords to search for in memory (for 'search')."},
        "tags": {"type": "string", "description": "Optional comma-separated tags (for 'store')."}
    },
    required=["action"]
)
def knowledge_memory(
    action: str,
    key: Optional[str] = "",
    content: Optional[str] = "",
    query: Optional[str] = "",
    tags: Optional[str] = ""
) -> str:
    from backend.app.storage.database import db
    try:
        if action == "store":
            if not key or not content:
                return "Error: 'key' and 'content' are required for 'store' action."
            res = db.add_memory(key=key, content=content, tags=tags or "")
            return f"Successfully saved memory (ID: {res['id']}, Topic: '{key}')."

        elif action == "search":
            q = query or key or ""
            if not q:
                return "Error: Please specify 'query' keywords to search memories."
            results = db.search_memories(q)
            if not results:
                return f"No memories found matching '{q}'."
            formatted = [f"- [{m['key']}] (Tags: {m.get('tags','')}): {m['content']}" for m in results]
            return "\n".join(formatted)

        elif action == "list":
            results = db.list_memories(limit=20)
            if not results:
                return "Memory store is currently empty."
            formatted = [f"- [{m['key']}]: {m['content']} ({m['created_at'][:10]})" for m in results]
            return "\n".join(formatted)

        else:
            return f"Unknown action: '{action}'. Allowed: ['store', 'search', 'list']."
    except Exception as e:
        return f"Memory operation error: {str(e)}"

@registry.register(
    name="generate_chart",
    description="Generate interactive chart visualization specifications for rendering inline charts in the UI. Chart types: 'bar', 'line', 'pie'.",
    parameters={
        "chart_type": {
            "type": "string",
            "enum": ["bar", "line", "pie"],
            "description": "Type of chart visualization."
        },
        "title": {"type": "string", "description": "Title of the chart."},
        "labels": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Category labels along X-axis or slices (e.g. ['Q1', 'Q2', 'Q3', 'Q4'])."
        },
        "values": {
            "type": "array",
            "items": {"type": "number"},
            "description": "Numerical values corresponding to labels (e.g. [120, 240, 180, 320])."
        },
        "dataset_name": {"type": "string", "description": "Name of the dataset (e.g. '營收 (萬元)')."}
    },
    required=["chart_type", "title", "labels", "values"]
)
def generate_chart(
    chart_type: str,
    title: str,
    labels: List[str],
    values: List[float],
    dataset_name: Optional[str] = "數值"
) -> str:
    chart_spec = {
        "is_chart": True,
        "type": chart_type,
        "title": title,
        "labels": labels,
        "dataset_name": dataset_name or "數值",
        "values": values
    }
    return json.dumps(chart_spec, ensure_ascii=False)

@registry.register(
    name="http_request_api",
    description="Send RESTful HTTP requests (GET, POST, PUT, DELETE, PATCH) to external APIs or web endpoints with customizable headers, query params, and JSON body payloads.",
    parameters={
        "method": {
            "type": "string",
            "enum": ["GET", "POST", "PUT", "DELETE", "PATCH"],
            "description": "HTTP request method (default: 'GET')."
        },
        "url": {
            "type": "string",
            "description": "Target HTTP/HTTPS URL."
        },
        "headers": {
            "type": "object",
            "description": "Optional HTTP request headers dictionary."
        },
        "params": {
            "type": "object",
            "description": "Optional URL query parameters dictionary."
        },
        "json_body": {
            "type": "object",
            "description": "Optional JSON payload object for POST/PUT/PATCH."
        },
        "timeout": {
            "type": "number",
            "description": "Request timeout in seconds (default: 15)."
        }
    },
    required=["url"]
)
async def http_request_api(
    url: str,
    method: str = "GET",
    headers: Optional[Dict[str, str]] = None,
    params: Optional[Dict[str, Any]] = None,
    json_body: Optional[Dict[str, Any]] = None,
    timeout: float = 15.0
) -> str:
    method = method.upper()
    req_headers = {
        "User-Agent": "AetherAI-Studio/2.0 API-Client"
    }
    if headers and isinstance(headers, dict):
        req_headers.update({str(k): str(v) for k, v in headers.items()})

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(timeout), follow_redirects=True) as client:
            resp = await client.request(
                method=method,
                url=url,
                headers=req_headers,
                params=params,
                json=json_body if json_body is not None else None
            )
            
            content_type = resp.headers.get("content-type", "")
            if "application/json" in content_type:
                try:
                    formatted_body = json.dumps(resp.json(), indent=2, ensure_ascii=False)
                except Exception:
                    formatted_body = resp.text
            else:
                formatted_body = resp.text[:4000] + ("\n...[Truncated]" if len(resp.text) > 4000 else "")

            return (
                f"Status: {resp.status_code} {resp.reason_phrase}\n"
                f"Content-Type: {content_type}\n"
                f"Response Body:\n{formatted_body}"
            )
    except Exception as e:
        return f"HTTP Request failed: {str(e)}"

@registry.register(
    name="document_text_extractor",
    description="Inspect, extract, and summarize text, table structures, and code definitions from files in the workspace (supports .txt, .md, .json, .csv, .py, .js, .ts, .html, .log, .pdf).",
    parameters={
        "path": {
            "type": "string",
            "description": "Relative file path inside the workspace."
        },
        "max_chars": {
            "type": "integer",
            "description": "Maximum characters to extract (default: 5000)."
        },
        "extract_structure": {
            "type": "boolean",
            "description": "If true, extracts structural overview (headers, functions, or schema) before raw content."
        }
    },
    required=["path"]
)
def document_text_extractor(
    path: str,
    max_chars: int = 5000,
    extract_structure: bool = True
) -> str:
    base = settings.workspace_dir.resolve()
    target = (base / path).resolve()
    if not target.is_relative_to(base):
        return f"Access Denied: Path '{path}' escapes workspace directory."
    if not target.exists():
        return f"File '{path}' does not exist in workspace."
    if not target.is_file():
        return f"Path '{path}' is a directory, not a file."

    ext = target.suffix.lower()
    file_size = target.stat().st_size

    try:
        # Check for PDF
        if ext == ".pdf":
            try:
                import pypdf
                reader = pypdf.PdfReader(str(target))
                text_pages = []
                for i, page in enumerate(reader.pages[:10]):
                    t = page.extract_text() or ""
                    if t.strip():
                        text_pages.append(f"--- Page {i+1} ---\n{t.strip()}")
                extracted = "\n\n".join(text_pages)
                return f"[PDF Document: {path}, {len(reader.pages)} pages, {file_size} bytes]\n\n" + (extracted[:max_chars] if extracted else "(No text extracted from PDF)")
            except Exception as e:
                return f"PDF extraction error or pypdf not available: {str(e)}"

        # Text/Code/JSON/CSV
        raw_text = target.read_text(encoding="utf-8", errors="replace")
        summary_parts = [f"File: {path} ({file_size} bytes, {ext})"]

        if extract_structure:
            if ext == ".csv":
                import csv
                import io
                f = io.StringIO(raw_text)
                reader = csv.reader(f)
                rows = list(reader)
                if rows:
                    summary_parts.append(f"CSV Structure: {len(rows)} rows, {len(rows[0])} columns")
                    summary_parts.append(f"Columns: {', '.join(rows[0][:15])}")
                    preview = "\n".join([", ".join(r[:8]) for r in rows[:6]])
                    summary_parts.append(f"Preview (First 5 rows):\n{preview}")
                    return "\n\n".join(summary_parts)

            elif ext == ".json":
                try:
                    data = json.loads(raw_text)
                    if isinstance(data, dict):
                        summary_parts.append(f"JSON Object with {len(data)} root keys: {list(data.keys())[:20]}")
                    elif isinstance(data, list):
                        summary_parts.append(f"JSON Array with {len(data)} items. First item preview: {str(data[0])[:200] if data else '[]'}")
                except Exception:
                    pass

            elif ext == ".md":
                headings = [line for line in raw_text.splitlines() if line.startswith("#")]
                if headings:
                    summary_parts.append("Markdown Outline:\n" + "\n".join(headings[:20]))

            elif ext in [".py", ".js", ".ts"]:
                defs = [line.strip() for line in raw_text.splitlines() if re.match(r"^\s*(def |class |async def |export |function )", line)]
                if defs:
                    summary_parts.append(f"Code Symbol Declarations ({len(defs)} items):\n" + "\n".join(defs[:25]))

        content_preview = raw_text[:max_chars]
        if len(raw_text) > max_chars:
            content_preview += f"\n... [Truncated, total {len(raw_text)} chars]"

        summary_parts.append(f"Content Extract:\n{content_preview}")
        return "\n\n".join(summary_parts)

    except Exception as e:
        return f"Error extracting text from '{path}': {str(e)}"

@registry.register(
    name="mermaid_generator",
    description="Generate syntactically correct Mermaid diagrams (flowchart, sequenceDiagram, classDiagram, stateDiagram, erDiagram, gantt) for inline interactive visual architecture rendering.",
    parameters={
        "diagram_type": {
            "type": "string",
            "enum": ["flowchart", "sequenceDiagram", "classDiagram", "stateDiagram", "erDiagram", "gantt"],
            "description": "Category of Mermaid diagram to construct."
        },
        "title": {
            "type": "string",
            "description": "Title of the architecture diagram."
        },
        "definition": {
            "type": "string",
            "description": "Mermaid diagram code definition body."
        }
    },
    required=["diagram_type", "title", "definition"]
)
def mermaid_generator(
    diagram_type: str,
    title: str,
    definition: str
) -> str:
    cleaned = definition.strip()
    if diagram_type == "flowchart" and not (cleaned.startswith("flowchart") or cleaned.startswith("graph")):
        cleaned = f"flowchart TD\n{cleaned}"
    elif diagram_type != "flowchart" and not cleaned.startswith(diagram_type):
        cleaned = f"{diagram_type}\n{cleaned}"

    markdown_mermaid = f"### 📊 {title}\n\n```mermaid\n{cleaned}\n```"
    return markdown_mermaid

@registry.register(
    name="code_linter_analyzer",
    description="Perform static code analysis, AST parsing, syntax validation, and security audit on workspace source code files (Python, JavaScript, TypeScript, JSON).",
    parameters={
        "path": {
            "type": "string",
            "description": "Workspace relative path of code file to lint and analyze."
        },
        "language": {
            "type": "string",
            "enum": ["python", "javascript", "json"],
            "description": "Language type to inspect (default: auto-detect from file extension)."
        }
    },
    required=["path"]
)
def code_linter_analyzer(path: str, language: Optional[str] = None) -> str:
    import ast
    base = settings.workspace_dir.resolve()
    target = (base / path).resolve()
    if not target.is_relative_to(base):
        return f"Access Denied: Path '{path}' escapes workspace directory."
    if not target.exists():
        return f"File '{path}' does not exist."
    if not target.is_file():
        return f"Path '{path}' is a directory."

    ext = target.suffix.lower()
    lang = language or ("python" if ext == ".py" else "json" if ext == ".json" else "javascript")
    code_text = target.read_text(encoding="utf-8", errors="replace")

    results = [f"=== Code Linter & Security Analysis: {path} ==="]

    if lang == "python":
        try:
            tree = ast.parse(code_text, filename=path)
            results.append("✅ Python Syntax: Valid (No syntax errors)")

            functions = [node.name for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))]
            classes = [node.name for node in ast.walk(tree) if isinstance(node, ast.ClassDef)]
            imports = []
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for n in node.names:
                        imports.append(n.name)
                elif isinstance(node, ast.ImportFrom):
                    imports.append(node.module or "")

            results.append(f"Structure: {len(classes)} classes, {len(functions)} functions, {len(imports)} imported modules")
            if classes:
                results.append(f"Classes: {', '.join(classes[:10])}")
            if functions:
                results.append(f"Functions: {', '.join(functions[:15])}")

            security_warnings = []
            for node in ast.walk(tree):
                if isinstance(node, ast.Call):
                    if isinstance(node.func, ast.Name) and node.func.id in ["eval", "exec"]:
                        security_warnings.append(f"⚠️ Line {getattr(node, 'lineno', '?')}: Insecure '{node.func.id}()' call detected.")
                    elif isinstance(node.func, ast.Attribute) and node.func.attr in ["system", "popen"]:
                        security_warnings.append(f"⚠️ Line {getattr(node, 'lineno', '?')}: Potential command injection risk in '{node.func.attr}()'.")

            if security_warnings:
                results.append("Security Warnings:\n" + "\n".join(security_warnings))
            else:
                results.append("🛡️ Security Audit: No high-risk dangerous calls (eval/exec/popen) detected.")

        except SyntaxError as se:
            results.append(f"❌ Syntax Error at line {se.lineno}, offset {se.offset}: {se.msg}")
            if se.text:
                results.append(f"   > {se.text.strip()}")

    elif lang == "json":
        try:
            parsed = json.loads(code_text)
            results.append("✅ JSON Syntax: Valid")
            if isinstance(parsed, dict):
                results.append(f"Root object keys ({len(parsed)}): {list(parsed.keys())[:15]}")
            elif isinstance(parsed, list):
                results.append(f"Root array items: {len(parsed)}")
        except json.JSONDecodeError as je:
            results.append(f"❌ JSON Syntax Error at line {je.lineno}, col {je.colno}: {je.msg}")

    else:
        open_braces = code_text.count('{') - code_text.count('}')
        open_parens = code_text.count('(') - code_text.count(')')
        open_brackets = code_text.count('[') - code_text.count(']')
        if open_braces == 0 and open_parens == 0 and open_brackets == 0:
            results.append("✅ Bracket/Brace Balance: Perfectly balanced")
        else:
            results.append(f"⚠️ Possible syntax mismatch: Braces diff: {open_braces}, Parens diff: {open_parens}, Brackets diff: {open_brackets}")
        results.append(f"Lines of Code: {len(code_text.splitlines())}, Size: {len(code_text)} bytes")

    return "\n".join(results)


# ==============================================================================
# Tool 14: ocr_extractor (Image to Text & Layout Structure Recognition)
# ==============================================================================

@registry.register(
    name="ocr_extractor",
    description="High-precision Optical Character Recognition (OCR) and visual text extraction tool. Analyzes image files (.png, .jpg, .jpeg, .webp, .bmp) in the workspace or uploads directory to extract textual content, document structures, titles, tables, and code snippets into clean markdown.",
    parameters={
        "path": {
            "type": "string",
            "description": "Relative path of the target image file in workspace or uploads (e.g. 'Rainmeter_Xc5SwdQGti.png' or 'uploads/sample.png')."
        },
        "max_chars": {
            "type": "integer",
            "description": "Maximum number of characters to return (default: 5000)."
        },
        "extract_structure": {
            "type": "boolean",
            "description": "If True, outputs structured layouts, paragraphs, and detected sections (default: True)."
        }
    },
    required=["path"]
)
def tool_ocr_extractor(
    path: Optional[str] = None,
    image_path: Optional[str] = None,
    file_path: Optional[str] = None,
    filePath: Optional[str] = None,
    filename: Optional[str] = None,
    file: Optional[str] = None,
    image: Optional[str] = None,
    input: Optional[str] = None,
    max_chars: int = 5000,
    extract_structure: bool = True,
    **kwargs: Any
) -> str:
    """Execute high-precision OCR on an image located inside workspace."""
    resolved_input = path or image_path or file_path or filePath or filename or file or image or input
    if not resolved_input:
        for k in ("path", "image_path", "file_path", "filePath", "filename", "file", "image", "img"):
            if k in kwargs and kwargs[k]:
                resolved_input = str(kwargs[k])
                break

    if not resolved_input or not isinstance(resolved_input, str):
        return "❌ 錯誤: 請提供有效的圖像檔案路徑 (path 或 image_path)。"

    target_path_str = resolved_input.strip()

    workspace_dir = settings.workspace_dir.resolve()
    clean_path = target_path_str.replace("\\", "/").lstrip("/")

    # Resolve target image file location
    candidate = (workspace_dir / clean_path).resolve()
    if not candidate.exists():
        # Check inside uploads subfolder of current workspace
        candidate = (workspace_dir / "uploads" / Path(clean_path).name).resolve()
    if not candidate.exists():
        # Check inside root base workspace uploads
        candidate = (settings.base_workspace_dir / "uploads" / Path(clean_path).name).resolve()
    if not candidate.exists():
        # Search workspace recursively by filename
        target_name = Path(clean_path).name
        for match in workspace_dir.rglob(target_name):
            candidate = match.resolve()
            break

    # Security boundary check
    if not str(candidate).startswith(str(workspace_dir)) and not str(candidate).startswith(str(settings.base_workspace_dir)):
        return "❌ 安全拒絕: 禁止存取超出工作區 (workspace) 範圍的外部路徑。"

    if not candidate.exists() or not candidate.is_file():
        available_images = []
        for ext in [".png", ".jpg", ".jpeg", ".webp", ".bmp"]:
            available_images.extend([f.name for f in workspace_dir.rglob(f"*{ext}")])
        hint = f"目前工作區內的圖像檔案包含: {', '.join(available_images[:5])}" if available_images else "目前工作區中尚未找到任何圖像檔案。"
        return f"❌ 找不到指定的圖像檔案 '{clean_path}'。\n💡 提示: {hint}"

    valid_exts = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"}
    if candidate.suffix.lower() not in valid_exts:
        return f"❌ 不支援的檔案格式 '{candidate.suffix}'。支援格式為: {', '.join(valid_exts)}"

    file_size_kb = round(candidate.stat().st_size / 1024, 2)
    rel_display_path = str(candidate.relative_to(workspace_dir)).replace("\\", "/")

    # Execute OCR
    extracted_text = ""
    language = "auto"
    line_count = 0

    # 1. Primary engine for Windows: Windows.Media.Ocr
    if sys.platform == "win32":
        ps_script = Path(__file__).resolve().parent / "ocr_runner.ps1"
        if ps_script.exists():
            try:
                cmd = [
                    "powershell",
                    "-NoProfile",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(ps_script),
                    "-ImagePath",
                    str(candidate)
                ]
                if extract_structure:
                    cmd.append("-ExtractStructure")

                res = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    timeout=30
                )
                if res.returncode == 0 and res.stdout.strip():
                    data = json.loads(res.stdout.strip())
                    if data.get("success"):
                        extracted_text = data.get("text", "")
                        language = data.get("language", "zh-Hant-TW")
                        line_count = data.get("line_count", 0)
                    else:
                        err_msg = data.get("error", "未知 OCR 錯誤")
                        return f"❌ Windows 原生 OCR 識別失敗: {err_msg}"
            except Exception as e:
                extracted_text = ""

    # 2. Secondary fallback: pytesseract if installed
    if not extracted_text:
        try:
            import pytesseract
            from PIL import Image
            img = Image.open(candidate)
            extracted_text = pytesseract.image_to_string(img, lang="chi_tra+chi_sim+eng")
            line_count = len([l for l in extracted_text.splitlines() if l.strip()])
            language = "tesseract-multi"
        except Exception:
            pass

    # 3. Tertiary fallback: tesseract CLI in system PATH
    if not extracted_text:
        try:
            tess_res = subprocess.run(
                ["tesseract", str(candidate), "stdout", "-l", "chi_tra+chi_sim+eng"],
                capture_output=True,
                text=True,
                timeout=20
            )
            if tess_res.returncode == 0 and tess_res.stdout.strip():
                extracted_text = tess_res.stdout.strip()
                line_count = len([l for l in extracted_text.splitlines() if l.strip()])
                language = "tesseract-cli"
        except Exception:
            pass

    if not extracted_text:
        return (
            f"❌ 無法對圖像 '{rel_display_path}' 提取文字。\n"
            f"原因: 該圖片可能未包含足夠解析度的文字，或系統 OCR 引擎無法解碼該圖像格式。\n"
            f"檔案大小: {file_size_kb} KB。"
        )

    # Clean and limit text
    if len(extracted_text) > max_chars:
        extracted_text = (
            extracted_text[:max_chars]
            + f"\n\n*(已達文字長度上限 {max_chars} 字元，其餘內容已截斷)*"
        )

    return (
        f"### 📷 OCR 圖像文字辨識成功 (Optical Character Recognition)\n"
        f"- **檔案名稱**: `{candidate.name}`\n"
        f"- **工作區路徑**: `{rel_display_path}` ({file_size_kb} KB)\n"
        f"- **辨識語系**: `{language}`\n"
        f"- **辨識行數**: {line_count} 行\n\n"
        f"#### 📝 提取之文字與結構內容:\n\n"
        f"```text\n{extracted_text}\n```\n\n"
        f"> 💡 **AetherAgent 提示**: 以上為自圖像精準提取的結構化文字數據。你可以直接基於上述文字進行深入分析、翻譯、數據提取或代碼重構。"
    )


# Register image_to_text as alias
registry.register(
    name="image_to_text",
    description="Alias of ocr_extractor. High-precision Optical Character Recognition (OCR) and visual text extraction tool.",
    parameters=registry._definitions["ocr_extractor"].parameters,
    required=["path"]
)(tool_ocr_extractor)


# ==============================================================================
# Tool 16: git_version_control
# ==============================================================================
@registry.register(
    name="git_version_control",
    description="Inspect git repository status, history, diffs, branches, and commit details. Useful for project version tracking, code review, and verifying workspace modifications.",
    parameters={
        "action": {
            "type": "string",
            "description": "Git operation: 'status', 'log', 'diff', 'branch', or 'show'.",
            "enum": ["status", "log", "diff", "branch", "show"]
        },
        "max_count": {
            "type": "integer",
            "description": "Maximum number of commits to show for 'log' action (default: 10, max: 50)."
        },
        "commit_hash": {
            "type": "string",
            "description": "Specific commit hash or ref for 'show' action."
        },
        "path": {
            "type": "string",
            "description": "Optional specific file or folder path relative to workspace or repository."
        }
    },
    required=["action"]
)
def tool_git_version_control(
    action: str,
    max_count: int = 10,
    commit_hash: Optional[str] = None,
    path: Optional[str] = None
) -> str:
    workspace_dir = settings.workspace_dir.resolve()
    repo_root = workspace_dir
    # Check if workspace or its parents are inside a git repository
    try:
        check = subprocess.run(
            ["git", "rev-parse", "--show-toplevel"],
            cwd=str(workspace_dir),
            capture_output=True,
            text=True,
            timeout=5
        )
        if check.returncode == 0 and check.stdout.strip():
            repo_root = Path(check.stdout.strip()).resolve()
    except Exception:
        pass

    action_lower = action.lower().strip()
    cmd = ["git"]

    if action_lower == "status":
        cmd.extend(["status", "--short", "--branch"])
        if path:
            cmd.append(path)
    elif action_lower == "log":
        limit = min(max(1, max_count), 50)
        cmd.extend(["log", f"-n{limit}", "--pretty=format:%h | %ad | %an | %s", "--date=short"])
        if path:
            cmd.extend(["--", path])
    elif action_lower == "diff":
        cmd.extend(["diff"])
        if commit_hash:
            cmd.append(commit_hash)
        if path:
            cmd.extend(["--", path])
    elif action_lower == "branch":
        cmd.extend(["branch", "-a"])
    elif action_lower == "show":
        target_ref = commit_hash or "HEAD"
        cmd.extend(["show", "--stat", "--oneline", target_ref])
    else:
        return f"❌ 未知的 Git 操作 '{action}'。支援的操作為: status, log, diff, branch, show。"

    try:
        res = subprocess.run(
            cmd,
            cwd=str(repo_root),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=15
        )
        out = res.stdout.strip()
        err = res.stderr.strip()

        if res.returncode != 0:
            return f"❌ Git 指令執行錯誤 (Code {res.returncode}):\n{err or out or '未知錯誤'}"

        if not out:
            out = "（無變更或空輸出）"

        # Truncate if output exceeds 6000 chars
        if len(out) > 6000:
            out = out[:5800] + f"\n\n... (輸出過長，總計 {len(out)} 字元，已節錄前 5800 字元) ..."

        return (
            f"### 🌿 Git 版本控制執行報告: `git {action_lower}`\n"
            f"- **儲存庫根目錄**: `{repo_root}`\n"
            f"- **執行狀態碼**: `{res.returncode}`\n\n"
            f"```text\n{out}\n```"
        )
    except subprocess.TimeoutExpired:
        return "❌ Git 操作超時（超過 15 秒）。"
    except Exception as e:
        return f"❌ 執行 Git 指令時發生異常: {str(e)}"


# ==============================================================================
# Tool 17: database_sqlite_inspector
# ==============================================================================
@registry.register(
    name="database_sqlite_inspector",
    description="Inspect SQLite database schema, list tables/views, describe column structures, or execute safe read-only SQL queries (SELECT) on databases within the workspace.",
    parameters={
        "db_path": {
            "type": "string",
            "description": "Relative path to the SQLite database file (.db, .sqlite, .sqlite3) within workspace."
        },
        "action": {
            "type": "string",
            "description": "Inspection action: 'list_tables', 'describe_table', 'query', or 'table_sample'.",
            "enum": ["list_tables", "describe_table", "query", "table_sample"]
        },
        "table_name": {
            "type": "string",
            "description": "Table or view name (required for 'describe_table' and 'table_sample')."
        },
        "query": {
            "type": "string",
            "description": "Read-only SQL query (SELECT, WITH, EXPLAIN) to execute (required for 'query')."
        },
        "limit": {
            "type": "integer",
            "description": "Maximum number of rows to return (default: 50, max: 200)."
        }
    },
    required=["db_path", "action"]
)
def tool_database_sqlite_inspector(
    db_path: str,
    action: str,
    table_name: Optional[str] = None,
    query: Optional[str] = None,
    limit: int = 50
) -> str:
    import sqlite3
    workspace_dir = settings.workspace_dir.resolve()
    clean_path = db_path.replace("\\", "/").strip().lstrip("/")
    target = (workspace_dir / clean_path).resolve()

    if not str(target).startswith(str(workspace_dir)):
        return "❌ 安全拒絕: 禁止存取超出工作區 (workspace) 範圍的資料庫檔案。"

    if not target.exists() or not target.is_file():
        dbs = [f.name for f in workspace_dir.rglob("*.sqlite*")] + [f.name for f in workspace_dir.rglob("*.db")]
        hint = f"目前工作區內的資料庫包含: {', '.join(dbs[:5])}" if dbs else "工作區內未找到資料庫檔案。"
        return f"❌ 找不到指定的資料庫檔案 '{clean_path}'。\n💡 提示: {hint}"

    action_lower = action.lower().strip()
    safe_limit = min(max(1, limit), 200)

    try:
        uri_path = f"file:{target.as_posix()}?mode=ro"
        conn = sqlite3.connect(uri_path, uri=True, timeout=10.0)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        if action_lower == "list_tables":
            cursor.execute("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name")
            rows = cursor.fetchall()
            if not rows:
                return f"### 🗄️ 資料庫 `{clean_path}` 表結構列表\n該資料庫中無任何使用者資料表或檢視表。"
            tables_md = ["| 表名 / 檢視表名 | 類型 |", "| :--- | :--- |"]
            for r in rows:
                tables_md.append(f"| `{r['name']}` | {r['type'].upper()} |")
            return f"### 🗄️ 資料庫 `{clean_path}` 結構清單 (共 {len(rows)} 個對象)\n" + "\n".join(tables_md)

        elif action_lower == "describe_table":
            if not table_name:
                return "❌ 請提供 table_name 參數以檢視資料表結構。"
            clean_tbl = re.sub(r"[^a-zA-Z0-9_\-\u4e00-\u9fa5]", "", table_name)
            cursor.execute(f"PRAGMA table_info(\"{clean_tbl}\")")
            cols = cursor.fetchall()
            if not cols:
                return f"❌ 資料表或檢視表 `{clean_tbl}` 不存在或無欄位資訊。"
            cols_md = ["| CID | 欄位名稱 | 資料型態 | 非空限制 (NOT NULL) | 預設值 | 主鍵 (PK) |", "| :--- | :--- | :--- | :--- | :--- | :--- |"]
            for c in cols:
                cols_md.append(f"| {c['cid']} | **`{c['name']}`** | `{c['type'] or 'ANY'}` | {'✓' if c['notnull'] else '✗'} | `{c['dflt_value']}` | {'🔑 PK' if c['pk'] else ''} |")
            return f"### 📋 資料表 `{clean_tbl}` 欄位結構規格\n" + "\n".join(cols_md)

        elif action_lower in ("query", "table_sample"):
            if action_lower == "table_sample":
                if not table_name:
                    return "❌ 請提供 table_name 參數以採樣資料。"
                clean_tbl = re.sub(r"[^a-zA-Z0-9_\-\u4e00-\u9fa5]", "", table_name)
                sql_to_run = f"SELECT * FROM \"{clean_tbl}\" LIMIT {safe_limit}"
            else:
                if not query or not query.strip():
                    return "❌ 請提供 query 參數以執行 SQL 查詢。"
                forbidden_keywords = [
                    "insert", "update", "delete", "drop", "alter", "create",
                    "vacuum", "attach", "detach", "reindex", "replace", "truncate"
                ]
                norm_q = query.strip().lower()
                first_token = norm_q.split()[0] if norm_q.split() else ""
                if first_token not in ("select", "with", "explain", "pragma"):
                    return f"❌ 安全拒絕: 僅允許執行唯讀查詢 (SELECT / WITH / EXPLAIN)。檢測到起始語句為 '{first_token}'。"
                for kw in forbidden_keywords:
                    if re.search(r"\b" + kw + r"\b", norm_q):
                        return f"❌ 安全拒絕: 查詢中包含潛在危險的變更操作關鍵字 '{kw.upper()}'。"
                sql_to_run = query.strip()
                if not re.search(r"\blimit\b", sql_to_run, re.IGNORECASE):
                    sql_to_run += f" LIMIT {safe_limit}"

            cursor.execute(sql_to_run)
            rows = cursor.fetchmany(safe_limit)
            if not rows:
                return f"### 📊 SQL 查詢成果: `{sql_to_run}`\n查詢執行成功，但未返回任何資料列 (0 rows)。"

            col_names = [d[0] for d in cursor.description]
            header = "| " + " | ".join(col_names) + " |"
            sep = "| " + " | ".join(["---"] * len(col_names)) + " |"
            md_lines = [header, sep]
            for r in rows:
                vals = [str(r[c] if r[c] is not None else "NULL").replace("|", "\\|").replace("\n", " ") for c in col_names]
                md_lines.append("| " + " | ".join(vals) + " |")

            return (
                f"### 📊 SQL 查詢成果 (前 {len(rows)} 筆資料)\n"
                f"- **執行語句**: `{sql_to_run}`\n\n"
                + "\n".join(md_lines)
            )
        else:
            return f"❌ 不支援的操作 '{action}'。可用操作: list_tables, describe_table, query, table_sample。"

    except sqlite3.Error as e:
        return f"❌ SQLite 查詢執行失敗: {str(e)}"
    finally:
        try:
            conn.close()
        except Exception:
            pass


# ==============================================================================
# Tool 18: data_transformer_converter
# ==============================================================================
@registry.register(
    name="data_transformer_converter",
    description="Convert and transform data formats: JSON <-> YAML, CSV <-> JSON, Markdown Tables, Base64 encoding/decoding, and URL encoding/decoding. Supports direct text or workspace files.",
    parameters={
        "action": {
            "type": "string",
            "description": "Transformation type: 'json_to_yaml', 'yaml_to_json', 'csv_to_json', 'json_to_csv', 'json_to_markdown_table', 'csv_to_markdown_table', 'base64_encode', 'base64_decode', 'url_encode', 'url_decode'.",
            "enum": [
                "json_to_yaml", "yaml_to_json",
                "csv_to_json", "json_to_csv",
                "json_to_markdown_table", "csv_to_markdown_table",
                "base64_encode", "base64_decode",
                "url_encode", "url_decode"
            ]
        },
        "input_data": {
            "type": "string",
            "description": "Raw string input data to transform (if not providing input_file)."
        },
        "input_file": {
            "type": "string",
            "description": "Optional relative path to input file in workspace."
        },
        "output_file": {
            "type": "string",
            "description": "Optional relative path to write the converted output in workspace."
        }
    },
    required=["action"]
)
def tool_data_transformer_converter(
    action: str,
    input_data: Optional[str] = None,
    input_file: Optional[str] = None,
    output_file: Optional[str] = None
) -> str:
    import csv
    import io
    import urllib.parse
    import base64
    import yaml
    workspace_dir = settings.workspace_dir.resolve()

    raw_text = input_data or ""
    if input_file:
        clean_in = input_file.replace("\\", "/").strip().lstrip("/")
        in_path = (workspace_dir / clean_in).resolve()
        if not str(in_path).startswith(str(workspace_dir)):
            return "❌ 安全拒絕: 禁止讀取工作區外部檔案。"
        if not in_path.exists() or not in_path.is_file():
            return f"❌ 找不到指定的輸入檔案 '{clean_in}'。"
        try:
            raw_text = in_path.read_text(encoding="utf-8")
        except Exception as e:
            return f"❌ 讀取檔案失敗: {str(e)}"

    if not raw_text.strip():
        return "❌ 請提供有效的 input_data 或 input_file 內容以進行轉換。"

    action_lower = action.lower().strip()
    result_text = ""

    try:
        if action_lower == "json_to_yaml":
            data = json.loads(raw_text)
            result_text = yaml.dump(data, allow_unicode=True, default_flow_style=False, sort_keys=False)
        elif action_lower == "yaml_to_json":
            data = yaml.safe_load(raw_text)
            result_text = json.dumps(data, ensure_ascii=False, indent=2)
        elif action_lower == "csv_to_json":
            reader = csv.DictReader(io.StringIO(raw_text))
            rows = list(reader)
            result_text = json.dumps(rows, ensure_ascii=False, indent=2)
        elif action_lower == "json_to_csv":
            data = json.loads(raw_text)
            if not isinstance(data, list):
                data = [data]
            if not data or not isinstance(data[0], dict):
                return "❌ JSON 轉換為 CSV 失敗: JSON 必須為物件陣列 (Array of objects)。"
            keys = list(data[0].keys())
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=keys)
            writer.writeheader()
            writer.writerows(data)
            result_text = output.getvalue()
        elif action_lower in ("json_to_markdown_table", "csv_to_markdown_table"):
            if action_lower == "json_to_markdown_table":
                data = json.loads(raw_text)
                if not isinstance(data, list):
                    data = [data]
                rows = data
            else:
                reader = csv.DictReader(io.StringIO(raw_text))
                rows = list(reader)
            if not rows or not isinstance(rows[0], dict):
                return "❌ 無法生成 Markdown 表格: 資料必須包含鍵值對物件。"
            keys = list(rows[0].keys())
            header = "| " + " | ".join(keys) + " |"
            sep = "| " + " | ".join(["---"] * len(keys)) + " |"
            lines = [header, sep]
            for r in rows:
                vals = [str(r.get(k, "")).replace("|", "\\|").replace("\n", " ") for k in keys]
                lines.append("| " + " | ".join(vals) + " |")
            result_text = "\n".join(lines)
        elif action_lower == "base64_encode":
            result_text = base64.b64encode(raw_text.encode("utf-8")).decode("utf-8")
        elif action_lower == "base64_decode":
            result_text = base64.b64decode(raw_text.strip().encode("utf-8")).decode("utf-8", errors="replace")
        elif action_lower == "url_encode":
            result_text = urllib.parse.quote(raw_text)
        elif action_lower == "url_decode":
            result_text = urllib.parse.unquote(raw_text)
        else:
            return f"❌ 未知的轉換操作 '{action}'。"

        saved_msg = ""
        if output_file:
            clean_out = output_file.replace("\\", "/").strip().lstrip("/")
            out_path = (workspace_dir / clean_out).resolve()
            if not str(out_path).startswith(str(workspace_dir)):
                return "❌ 安全拒絕: 禁止寫入工作區外部路徑。"
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(result_text, encoding="utf-8")
            saved_msg = f"\n- **輸出已儲存至**: `{clean_out}`"

        preview = result_text
        if len(preview) > 5000:
            preview = preview[:4800] + f"\n\n... (內容過長，總計 {len(preview)} 字元，已截斷預覽) ..."

        return (
            f"### 🔄 資料轉換完成: `{action_lower}`{saved_msg}\n\n"
            f"```text\n{preview}\n```"
        )
    except Exception as e:
        return f"❌ 資料轉換過程發生錯誤: {str(e)}"


# ==============================================================================
# Tool 19: hash_crypto_inspector
# ==============================================================================
@registry.register(
    name="hash_crypto_inspector",
    description="Compute cryptographic hash digests and checksums (SHA-256, SHA-512, MD5, SHA-1, CRC32, HMAC) for strings or workspace files to verify file integrity and calculate security tokens.",
    parameters={
        "action": {
            "type": "string",
            "description": "Target type: 'hash_text' (hash provided string) or 'hash_file' (hash a file in workspace).",
            "enum": ["hash_text", "hash_file"]
        },
        "algorithm": {
            "type": "string",
            "description": "Hash algorithm: 'sha256', 'sha512', 'md5', 'sha1', 'crc32', or 'hmac_sha256'. Default: 'sha256'.",
            "enum": ["sha256", "sha512", "md5", "sha1", "crc32", "hmac_sha256"]
        },
        "text": {
            "type": "string",
            "description": "Text content to hash (required for 'hash_text')."
        },
        "file_path": {
            "type": "string",
            "description": "Relative path to file in workspace (required for 'hash_file')."
        },
        "secret_key": {
            "type": "string",
            "description": "Secret key for HMAC hashing (required when algorithm is 'hmac_sha256')."
        }
    },
    required=["action"]
)
def tool_hash_crypto_inspector(
    action: str,
    algorithm: str = "sha256",
    text: Optional[str] = None,
    file_path: Optional[str] = None,
    secret_key: Optional[str] = None
) -> str:
    import hashlib
    import hmac
    import zlib
    workspace_dir = settings.workspace_dir.resolve()
    algo = algorithm.lower().strip()
    action_lower = action.lower().strip()

    try:
        if action_lower == "hash_text":
            if text is None:
                return "❌ 請提供 text 參數以計算字串雜湊。"
            data_bytes = text.encode("utf-8")
            if algo == "crc32":
                digest = f"{zlib.crc32(data_bytes) & 0xffffffff:08x}"
            elif algo == "hmac_sha256":
                if not secret_key:
                    return "❌ 計算 HMAC-SHA256 必須提供 secret_key 參數。"
                digest = hmac.new(secret_key.encode("utf-8"), data_bytes, hashlib.sha256).hexdigest()
            elif algo in ("sha256", "sha512", "md5", "sha1"):
                h = getattr(hashlib, algo)()
                h.update(data_bytes)
                digest = h.hexdigest()
            else:
                return f"❌ 不支援的演算法 '{algorithm}'。支援: sha256, sha512, md5, sha1, crc32, hmac_sha256。"

            return (
                f"### 🔐 字串雜湊計算成果 (Hash Digest)\n"
                f"- **演算法**: `{algo.upper()}`\n"
                f"- **原始字元數**: {len(text)} 字元\n"
                f"- **雜湊值 (Digest)**: `{digest}`"
            )

        elif action_lower == "hash_file":
            if not file_path:
                return "❌ 請提供 file_path 參數以計算檔案雜湊。"
            clean_p = file_path.replace("\\", "/").strip().lstrip("/")
            target = (workspace_dir / clean_p).resolve()
            if not str(target).startswith(str(workspace_dir)):
                return "❌ 安全拒絕: 禁止存取工作區外的檔案。"
            if not target.exists() or not target.is_file():
                return f"❌ 找不到指定的檔案 '{clean_p}'。"

            file_size = target.stat().st_size
            crc_val = 0
            if algo == "crc32":
                with open(target, "rb") as f:
                    while chunk := f.read(65536):
                        crc_val = zlib.crc32(chunk, crc_val)
                digest = f"{crc_val & 0xffffffff:08x}"
            elif algo == "hmac_sha256":
                if not secret_key:
                    return "❌ 計算 HMAC-SHA256 必須提供 secret_key 參數。"
                h = hmac.new(secret_key.encode("utf-8"), b"", hashlib.sha256)
                with open(target, "rb") as f:
                    while chunk := f.read(65536):
                        h.update(chunk)
                digest = h.hexdigest()
            elif algo in ("sha256", "sha512", "md5", "sha1"):
                h = getattr(hashlib, algo)()
                with open(target, "rb") as f:
                    while chunk := f.read(65536):
                        h.update(chunk)
                digest = h.hexdigest()
            else:
                return f"❌ 不支援的演算法 '{algorithm}'。"

            return (
                f"### 🔐 檔案校驗雜湊計算成果 (File Hash Digest)\n"
                f"- **檔案名稱**: `{target.name}`\n"
                f"- **工作區路徑**: `{clean_p}` ({round(file_size/1024, 2)} KB)\n"
                f"- **演算法**: `{algo.upper()}`\n"
                f"- **校驗雜湊碼**: `{digest}`"
            )
        else:
            return f"❌ 未知的操作 '{action}'。可用: hash_text, hash_file。"
    except Exception as e:
        return f"❌ 雜湊計算失敗: {str(e)}"


# ==============================================================================
# Tool 20: regex_pattern_matcher
# ==============================================================================
@registry.register(
    name="regex_pattern_matcher",
    description="Analyze, validate, match, extract, or replace regular expression (Regex) patterns against text or workspace files with detailed capture group inspection.",
    parameters={
        "action": {
            "type": "string",
            "description": "Operation: 'find_all' (extract all matches with groups), 'test' (test if pattern matches), 'replace' (regex replacement), or 'validate' (check regex syntax).",
            "enum": ["find_all", "test", "replace", "validate"]
        },
        "pattern": {
            "type": "string",
            "description": "Regular expression pattern string (e.g. r'(\\d{4})-(\\d{2})-(\\d{2})')."
        },
        "text": {
            "type": "string",
            "description": "Text to evaluate against (if not reading from file_path)."
        },
        "file_path": {
            "type": "string",
            "description": "Optional relative path to a workspace file to search or replace."
        },
        "replacement": {
            "type": "string",
            "description": "Replacement string or template (required for 'replace' action)."
        },
        "flags": {
            "type": "string",
            "description": "Regex flags: 'i' (ignore case), 'm' (multiline), 's' (dot matches all), or combined e.g. 'im'."
        },
        "max_matches": {
            "type": "integer",
            "description": "Maximum number of matches to return (default: 50, max: 200)."
        }
    },
    required=["action", "pattern"]
)
def tool_regex_pattern_matcher(
    action: str,
    pattern: str,
    text: Optional[str] = None,
    file_path: Optional[str] = None,
    replacement: Optional[str] = None,
    flags: str = "",
    max_matches: int = 50
) -> str:
    workspace_dir = settings.workspace_dir.resolve()
    action_lower = action.lower().strip()

    re_flags = 0
    if "i" in flags.lower():
        re_flags |= re.IGNORECASE
    if "m" in flags.lower():
        re_flags |= re.MULTILINE
    if "s" in flags.lower():
        re_flags |= re.DOTALL

    try:
        compiled = re.compile(pattern, re_flags)
    except re.error as e:
        return f"❌ 正規表達式語法無效: {str(e)} (在位置 {e.pos if hasattr(e, 'pos') else '未知'})"

    if action_lower == "validate":
        return (
            f"### ✅ 正則表達式語法檢驗通過\n"
            f"- **模式 (Pattern)**: `{pattern}`\n"
            f"- **旗標 (Flags)**: `{flags or '無'}`\n"
            f"- **捕獲分組數**: {compiled.groups} 個分組\n"
            f"- **分組名稱**: `{list(compiled.groupindex.keys()) or '無具名分組'}`"
        )

    content = text or ""
    if file_path:
        clean_p = file_path.replace("\\", "/").strip().lstrip("/")
        target = (workspace_dir / clean_p).resolve()
        if not str(target).startswith(str(workspace_dir)):
            return "❌ 安全拒絕: 禁止存取工作區外的檔案。"
        if not target.exists() or not target.is_file():
            return f"❌ 找不到指定的檔案 '{clean_p}'。"
        try:
            content = target.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            return f"❌ 讀取檔案失敗: {str(e)}"

    if not content:
        return "❌ 請提供 text 或有效的 file_path 內容以執行正則運算。"

    limit = min(max(1, max_matches), 200)

    if action_lower == "test":
        m = compiled.search(content)
        if m:
            groups_dict = m.groupdict()
            indexed_groups = m.groups()
            return (
                f"### 🎯 正則表達式匹配成功 (Match Found)\n"
                f"- **模式**: `{pattern}`\n"
                f"- **首個匹配位置**: `[{m.start()}, {m.end()}]`\n"
                f"- **完全匹配字串**: `{m.group(0)}`\n"
                f"- **位置分組**: `{indexed_groups}`\n"
                f"- **具名分組**: `{groups_dict}`"
            )
        else:
            return f"### ⚪ 正則表達式未匹配到任何內容\n- **模式**: `{pattern}`\n- **文本長度**: {len(content)} 字元"

    elif action_lower == "find_all":
        matches = list(compiled.finditer(content))
        if not matches:
            return f"### ⚪ 未找到任何符合的項目 (0 Matches)\n- **模式**: `{pattern}`"

        res_lines = [f"### 🔍 正則表達式檢索結果: 共找到 {len(matches)} 處匹配 (顯示前 {min(len(matches), limit)} 筆)\n"]
        for idx, m in enumerate(matches[:limit], 1):
            val = m.group(0).replace("\n", "\\n")
            if len(val) > 80:
                val = val[:77] + "..."
            info = f"**#{idx}** (Span: `[{m.start()}, {m.end()}]`): `{val}`"
            if m.groupdict():
                info += f" | 具名: `{m.groupdict()}`"
            elif m.groups():
                info += f" | 分組: `{m.groups()}`"
            res_lines.append(info)

        return "\n".join(res_lines)

    elif action_lower == "replace":
        if replacement is None:
            return "❌ 執行 replace 操作必須提供 replacement 參數。"
        replaced_text, count = compiled.subn(replacement, content)
        preview = replaced_text
        if len(preview) > 4000:
            preview = preview[:3800] + f"\n\n... (替換後內容過長，總計 {len(preview)} 字元，已截斷) ..."

        return (
            f"### ✏️ 正則表達式替換完成 (共替換 {count} 處)\n"
            f"- **正則模式**: `{pattern}`\n"
            f"- **替換目標**: `{replacement}`\n\n"
            f"```text\n{preview}\n```"
        )
    else:
        return f"❌ 不支援的正則操作 '{action}'。支援: find_all, test, replace, validate。"


# ==============================================================================
# Tool 21: archive_compressor
# ==============================================================================
@registry.register(
    name="archive_compressor",
    description="Inspect, extract, or create compressed archives (ZIP, TAR, GZ, TGZ) in the workspace. Facilitates packaging project deliverables and extracting compressed resources.",
    parameters={
        "action": {
            "type": "string",
            "description": "Archive operation: 'list_contents', 'extract', or 'create_zip'.",
            "enum": ["list_contents", "extract", "create_zip"]
        },
        "archive_path": {
            "type": "string",
            "description": "Relative path to the archive file in workspace (e.g. 'project.zip', 'data.tar.gz')."
        },
        "destination_path": {
            "type": "string",
            "description": "Relative destination directory in workspace for extraction, or output zip name for creation."
        },
        "files_to_compress": {
            "type": "array",
            "items": {"type": "string"},
            "description": "List of relative file or folder paths in workspace to include when action is 'create_zip'."
        }
    },
    required=["action", "archive_path"]
)
def tool_archive_compressor(
    action: str,
    archive_path: str,
    destination_path: Optional[str] = None,
    files_to_compress: Optional[List[str]] = None
) -> str:
    import zipfile
    import tarfile
    workspace_dir = settings.workspace_dir.resolve()
    clean_arch = archive_path.replace("\\", "/").strip().lstrip("/")
    target_arch = (workspace_dir / clean_arch).resolve()

    if not str(target_arch).startswith(str(workspace_dir)):
        return "❌ 安全拒絕: 禁止存取超出工作區範圍的壓縮檔案路徑。"

    action_lower = action.lower().strip()

    try:
        if action_lower == "list_contents":
            if not target_arch.exists() or not target_arch.is_file():
                return f"❌ 找不到壓縮檔案 '{clean_arch}'。"

            entries = []
            if zipfile.is_zipfile(target_arch):
                with zipfile.ZipFile(target_arch, "r") as zf:
                    for info in zf.infolist():
                        entries.append({
                            "name": info.filename,
                            "size": info.file_size,
                            "compress_size": info.compress_size,
                            "is_dir": info.is_dir()
                        })
            elif tarfile.is_tarfile(target_arch):
                with tarfile.open(target_arch, "r:*") as tf:
                    for m in tf.getmembers():
                        entries.append({
                            "name": m.name,
                            "size": m.size,
                            "compress_size": m.size,
                            "is_dir": m.isdir()
                        })
            else:
                return f"❌ 不支援或已損壞的封存格式 '{target_arch.suffix}'。支援: .zip, .tar, .tar.gz, .tgz。"

            lines = [
                f"### 📦 壓縮檔內容檢視: `{clean_arch}` (共 {len(entries)} 個條目)\n",
                "| 檔案名稱 / 路徑 | 原始大小 | 壓縮後大小 | 類型 |",
                "| :--- | :--- | :--- | :--- |"
            ]
            for e in entries[:60]:
                type_tag = "目錄" if e["is_dir"] else "檔案"
                size_str = f"{round(e['size']/1024, 1)} KB" if e['size'] > 1024 else f"{e['size']} B"
                lines.append(f"| `{e['name']}` | {size_str} | {round(e['compress_size']/1024, 1)} KB | {type_tag} |")
            if len(entries) > 60:
                lines.append(f"\n*(尚有 {len(entries) - 60} 個項目未展開)*")
            return "\n".join(lines)

        elif action_lower == "extract":
            if not target_arch.exists() or not target_arch.is_file():
                return f"❌ 找不到壓縮檔案 '{clean_arch}'。"

            dest_rel = (destination_path or target_arch.stem).replace("\\", "/").strip().lstrip("/")
            dest_dir = (workspace_dir / dest_rel).resolve()
            if not str(dest_dir).startswith(str(workspace_dir)):
                return "❌ 安全拒絕: 解壓縮目標目錄超出工作區安全範圍。"
            dest_dir.mkdir(parents=True, exist_ok=True)

            extracted_count = 0
            if zipfile.is_zipfile(target_arch):
                with zipfile.ZipFile(target_arch, "r") as zf:
                    for member in zf.namelist():
                        resolved_target = (dest_dir / member).resolve()
                        if not str(resolved_target).startswith(str(dest_dir)):
                            return f"❌ 安全拒絕: 偵測到路徑穿越攻擊 (Zip Slip) 條目: {member}"
                    zf.extractall(dest_dir)
                    extracted_count = len(zf.namelist())
            elif tarfile.is_tarfile(target_arch):
                with tarfile.open(target_arch, "r:*") as tf:
                    for member in tf.getmembers():
                        resolved_target = (dest_dir / member.name).resolve()
                        if not str(resolved_target).startswith(str(dest_dir)):
                            return f"❌ 安全拒絕: 偵測到路徑穿越攻擊 (Tar Slip) 條目: {member.name}"
                    tf.extractall(dest_dir)
                    extracted_count = len(tf.getmembers())
            else:
                return f"❌ 不支援的封存格式。"

            return (
                f"### 📂 解壓縮完成\n"
                f"- **原始檔案**: `{clean_arch}`\n"
                f"- **解壓目標**: `{dest_rel}`\n"
                f"- **成功提取**: {extracted_count} 個項目"
            )

        elif action_lower == "create_zip":
            if not files_to_compress:
                return "❌ 建立 ZIP 封存檔案必須提供 files_to_compress 檔案清單。"

            target_arch.parent.mkdir(parents=True, exist_ok=True)
            added_files = []
            with zipfile.ZipFile(target_arch, "w", zipfile.ZIP_DEFLATED) as zf:
                for item in files_to_compress:
                    clean_item = item.replace("\\", "/").strip().lstrip("/")
                    item_path = (workspace_dir / clean_item).resolve()
                    if not str(item_path).startswith(str(workspace_dir)):
                        continue
                    if item_path.is_file():
                        arcname = item_path.relative_to(workspace_dir)
                        zf.write(item_path, arcname=str(arcname))
                        added_files.append(str(arcname))
                    elif item_path.is_dir():
                        for sub in item_path.rglob("*"):
                            if sub.is_file():
                                arcname = sub.relative_to(workspace_dir)
                                zf.write(sub, arcname=str(arcname))
                                added_files.append(str(arcname))

            arch_size = round(target_arch.stat().st_size / 1024, 2)
            return (
                f"### 🗜️ ZIP 封存打包完成\n"
                f"- **生成檔案**: `{clean_arch}` ({arch_size} KB)\n"
                f"- **已打包項目**: 共 {len(added_files)} 個檔案"
            )
        else:
            return f"❌ 未知的操作 '{action}'。支援: list_contents, extract, create_zip。"
    except Exception as e:
        return f"❌ 壓縮檔操作失敗: {str(e)}"


# ==============================================================================
# Tool 22: network_dns_whois_lookup
# ==============================================================================
@registry.register(
    name="network_dns_whois_lookup",
    description="Perform network diagnostics: DNS record resolution (A, AAAA, MX, TXT, CNAME, NS), TCP port connectivity & latency checks, and HTTP response headers/SSL certificate inspection.",
    parameters={
        "action": {
            "type": "string",
            "description": "Diagnostic action: 'dns_resolve', 'port_check', or 'http_headers'.",
            "enum": ["dns_resolve", "port_check", "http_headers"]
        },
        "host": {
            "type": "string",
            "description": "Hostname, domain, or IP address (e.g. 'github.com', 'api.openai.com', '8.8.8.8')."
        },
        "port": {
            "type": "integer",
            "description": "Port number for 'port_check' (e.g. 80, 443, 8000, 11434). Default: 80 or 443."
        },
        "record_type": {
            "type": "string",
            "description": "DNS record type for 'dns_resolve': 'A', 'AAAA', 'MX', 'TXT', 'CNAME', 'NS', or 'ALL'. Default: 'A'.",
            "enum": ["A", "AAAA", "MX", "TXT", "CNAME", "NS", "ALL"]
        },
        "timeout_seconds": {
            "type": "number",
            "description": "Connection timeout in seconds (default: 5.0, max: 15.0)."
        }
    },
    required=["action", "host"]
)
async def tool_network_dns_whois_lookup(
    action: str,
    host: str,
    port: Optional[int] = None,
    record_type: str = "A",
    timeout_seconds: float = 5.0
) -> str:
    import socket
    clean_host = host.strip()
    if clean_host.startswith("http://"):
        clean_host = clean_host[7:]
    elif clean_host.startswith("https://"):
        clean_host = clean_host[8:]
    clean_host = clean_host.split("/")[0].split(":")[0]

    action_lower = action.lower().strip()
    timeout = min(max(1.0, timeout_seconds), 15.0)

    if action_lower == "dns_resolve":
        try:
            results = []
            rec = record_type.upper().strip()
            if rec in ("A", "ALL"):
                try:
                    _, _, ip_list = socket.gethostbyname_ex(clean_host)
                    for ip in ip_list:
                        results.append(f"- **A (IPv4)**: `{ip}`")
                except Exception:
                    pass
            if rec in ("AAAA", "ALL"):
                try:
                    addr_info = socket.getaddrinfo(clean_host, None, socket.AF_INET6)
                    seen_v6 = set()
                    for item in addr_info:
                        v6 = item[4][0]
                        if v6 not in seen_v6:
                            seen_v6.add(v6)
                            results.append(f"- **AAAA (IPv6)**: `{v6}`")
                except Exception:
                    pass

            if rec in ("MX", "TXT", "CNAME", "NS", "ALL") or not results:
                try:
                    ns_cmd = ["nslookup"]
                    if rec != "ALL":
                        ns_cmd.extend([f"-type={rec}"])
                    ns_cmd.append(clean_host)
                    res = subprocess.run(ns_cmd, capture_output=True, text=True, timeout=5)
                    out = res.stdout.strip()
                    if out and "Non-authoritative answer:" in out:
                        ans_part = out.split("Non-authoritative answer:")[-1].strip()
                        results.append(f"```text\n{ans_part}\n```")
                    elif out:
                        results.append(f"```text\n{out}\n```")
                except Exception:
                    pass

            if not results:
                return f"❌ DNS 解析失敗: 無法為主機 `{clean_host}` 解析 `{rec}` 紀錄。"

            return (
                f"### 🌐 DNS 網域名稱解析報告\n"
                f"- **目標主機**: `{clean_host}`\n"
                f"- **查詢紀錄**: `{rec}`\n\n"
                + "\n".join(results)
            )
        except Exception as e:
            return f"❌ DNS 解析異常: {str(e)}"

    elif action_lower == "port_check":
        check_port = port or 443
        start_t = time.time()
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(timeout)
            err_code = sock.connect_ex((clean_host, check_port))
            latency_ms = round((time.time() - start_t) * 1000, 2)
            sock.close()

            status_str = "🟢 連線通暢 (OPEN)" if err_code == 0 else f"🔴 連線失敗/關閉 (CLOSED / REFUSED, Code {err_code})"
            return (
                f"### 🔌 TCP 連接埠探測成果\n"
                f"- **目標目標**: `{clean_host}:{check_port}`\n"
                f"- **連線狀態**: **{status_str}**\n"
                f"- **往返延遲 (Latency)**: `{latency_ms} ms`"
            )
        except Exception as e:
            return f"❌ TCP 探測失敗: {str(e)}"

    elif action_lower == "http_headers":
        test_url = f"https://{clean_host}" if (port == 443 or port is None) else f"http://{clean_host}:{port}"
        try:
            async with httpx.AsyncClient(timeout=timeout, verify=False, follow_redirects=True) as client:
                resp = await client.head(test_url)
                if resp.status_code == 405:
                    resp = await client.get(test_url)
                
                headers_md = []
                for k, v in resp.headers.items():
                    headers_md.append(f"| **`{k}`** | `{v}` |")
                
                headers_table = "| 標頭名稱 (Header) | 標頭數值 (Value) |\n| :--- | :--- |\n" + "\n".join(headers_md)
                return (
                    f"### 🌐 HTTP 伺服器回應標頭檢視\n"
                    f"- **請求位址**: `{test_url}`\n"
                    f"- **狀態碼**: `{resp.status_code} {resp.reason_phrase}`\n"
                    f"- **HTTP 協定**: `{resp.http_version}`\n\n"
                    + headers_table
                )
        except Exception as e:
            return f"❌ HTTP 標頭檢視失敗: {str(e)}"
    else:
        return f"❌ 未知的診斷操作 '{action}'。支援: dns_resolve, port_check, http_headers。"



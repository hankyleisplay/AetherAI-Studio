import os
import sys
import json
import time
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

    async def execute(self, name: str, args: Any) -> Dict[str, Any]:
        if name not in self._tools:
            return {"error": f"Tool '{name}' not found."}
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
                res = func(**args)
            duration = round(time.time() - start_time, 3)
            return {
                "success": True,
                "output": res,
                "duration_seconds": duration
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"Execution error in {name}: {str(e)}",
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
            "description": "The file operation to perform."
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
def file_system(action: str, path: str, content: Optional[str] = None) -> str:
    base = settings.workspace_dir.resolve()
    target = (base / path).resolve()
    
    # Path traversal check
    if not target.is_relative_to(base):
        return f"Access Denied: Path '{path}' escapes workspace directory."

    try:
        if action == "read":
            if not target.exists():
                return f"File '{path}' does not exist."
            if not target.is_file():
                return f"Path '{path}' is a directory, not a file."
            return target.read_text(encoding="utf-8", errors="replace")

        elif action == "write":
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content or "", encoding="utf-8")
            return f"Successfully wrote {len(content or '')} characters to '{path}'."

        elif action == "list":
            if not target.exists():
                return f"Directory '{path}' does not exist."
            if not target.is_dir():
                return f"Path '{path}' is not a directory."
            items = []
            for item in sorted(target.iterdir()):
                rel = item.relative_to(base).as_posix()
                prefix = "[DIR] " if item.is_dir() else "[FILE]"
                size = f"({item.stat().st_size} bytes)" if item.is_file() else ""
                items.append(f"{prefix} {rel} {size}")
            return "\n".join(items) if items else "(Directory is empty)"

        elif action == "delete":
            if not target.exists():
                return f"Path '{path}' does not exist."
            if target.is_file():
                target.unlink()
                return f"File '{path}' deleted."
            elif target.is_dir():
                import shutil
                shutil.rmtree(target)
                return f"Directory '{path}' and all contents deleted."

        else:
            return f"Unknown action: '{action}'. Must be one of ['read', 'write', 'list', 'delete']."

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
def tool_ocr_extractor(path: str, max_chars: int = 5000, extract_structure: bool = True) -> str:
    """Execute high-precision OCR on an image located inside workspace."""
    if not path or not isinstance(path, str):
        return "❌ 錯誤: 請提供有效的圖像檔案路徑 (path)。"

    workspace_dir = settings.workspace_dir.resolve()
    clean_path = path.strip().replace("\\", "/").lstrip("/")

    # Resolve target image file location
    candidate = (workspace_dir / clean_path).resolve()
    if not candidate.exists():
        # Check inside uploads subfolder
        candidate = (workspace_dir / "uploads" / Path(clean_path).name).resolve()
    if not candidate.exists():
        # Search workspace recursively by filename
        target_name = Path(clean_path).name
        for match in workspace_dir.rglob(target_name):
            candidate = match.resolve()
            break

    # Security boundary check
    if not str(candidate).startswith(str(workspace_dir)):
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



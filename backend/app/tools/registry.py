import os
import sys
import json
import time
import inspect
import re
import httpx
import subprocess
import platform
import psutil
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Callable, Optional
from pydantic import BaseModel
from backend.app.config import settings

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

    async def execute(self, name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        if name not in self._tools:
            return {"error": f"Tool '{name}' not found."}
        func = self._tools[name]
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

@registry.register(
    name="web_search",
    description="Search the web for real-time information, news, documentation or answers using DuckDuckGo.",
    parameters={
        "query": {"type": "string", "description": "The search query keywords."},
        "max_results": {"type": "integer", "description": "Number of results to return (default: 5)."}
    },
    required=["query"]
)
def web_search(query: str, max_results: int = 5) -> str:
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
        if not results:
            return f"No search results found for query: '{query}'."
        formatted = []
        for i, r in enumerate(results, 1):
            title = r.get("title", "")
            href = r.get("href", "")
            body = r.get("body", "")
            formatted.append(f"[{i}] {title}\nURL: {href}\nSnippet: {body}\n")
        return "\n".join(formatted)
    except Exception as e:
        return f"Web search failed or network restricted: {str(e)}"

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
        res = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True,
            text=True,
            timeout=15,
            cwd=str(settings.workspace_dir)
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
            text=True,
            timeout=30,
            cwd=str(settings.workspace_dir)
        )
        out = res.stdout.strip()
        err = res.stderr.strip()
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
    if not str(target).startswith(str(base)):
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
                rel = item.relative_to(base)
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
    now_utc = datetime.utcnow()
    return (
        f"Current Local Time: {now.strftime('%Y-%m-%d %H:%M:%S %A')}\n"
        f"Current UTC Time: {now_utc.strftime('%Y-%m-%d %H:%M:%S UTC')}\n"
        f"ISO Timestamp: {now.isoformat()}"
    )

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
    if not str(target).startswith(str(base)):
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
    if not str(target).startswith(str(base)):
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


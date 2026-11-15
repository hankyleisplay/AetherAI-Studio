"""Start, check and stop the local Ollama server, and download models into it.

The app used to expect Ollama to be running already; when it was not, every message failed and the user had to
start it by hand. Now:

- when Ollama is not answering at a local address, Aether starts `ollama serve` in the background (no window);
- when Aether shuts down it stops the Ollama it started (an Ollama the user started is never touched);
- models can be downloaded from the UI with progress (`pull_model`).

Set AETHER_OLLAMA_AUTOSTART=0 to turn the automatic start off, or AETHER_OLLAMA_PATH to point at ollama(.exe).
"""
import asyncio
import json
import os
import platform
import shutil
import subprocess
import time
from typing import Any, AsyncGenerator, Dict, List, Optional
from urllib.parse import urlsplit

import httpx

from backend.app.config import DATA_DIR
from backend.app.llm.provider import direct_connection_kwargs, ollama_base_candidates

PID_FILE = DATA_DIR / "ollama_autostart.pid"
LOG_FILE = DATA_DIR / "ollama_autostart.log"
START_TIMEOUT_SECONDS = 25

# Ordered from largest to smallest: the first whose memory need fits is recommended
MODEL_CHOICES: List[Dict[str, Any]] = [
    {"name": "qwen3:14b", "size_gb": 9.3, "min_vram_gb": 12.0, "label": "Qwen3 14B"},
    {"name": "qwen3:8b", "size_gb": 5.2, "min_vram_gb": 7.0, "label": "Qwen3 8B"},
    {"name": "qwen3:4b", "size_gb": 2.5, "min_vram_gb": 3.5, "label": "Qwen3 4B"},
    {"name": "qwen3:1.7b", "size_gb": 1.4, "min_vram_gb": 0.0, "label": "Qwen3 1.7B"},
]

_lock = asyncio.Lock()
_started: Optional[subprocess.Popen] = None
_adopted_pid: Optional[int] = None


def autostart_enabled() -> bool:
    return os.environ.get("AETHER_OLLAMA_AUTOSTART", "1").strip().lower() not in ("0", "false", "no", "off")


def _is_local(base_url: str) -> bool:
    return bool(direct_connection_kwargs(base_url))


def find_ollama_executable() -> Optional[str]:
    override = os.environ.get("AETHER_OLLAMA_PATH")
    if override and os.path.isfile(override):
        return override
    found = shutil.which("ollama")
    if found:
        return found
    candidates: List[str] = []
    system = platform.system()
    if system == "Windows":
        local = os.environ.get("LOCALAPPDATA", "")
        candidates += [
            os.path.join(local, "Programs", "Ollama", "ollama.exe"),
            os.path.join(os.environ.get("ProgramFiles", r"C:\Program Files"), "Ollama", "ollama.exe"),
        ]
    elif system == "Darwin":
        candidates += ["/Applications/Ollama.app/Contents/Resources/ollama", "/opt/homebrew/bin/ollama",
                       "/usr/local/bin/ollama"]
    else:
        candidates += ["/usr/local/bin/ollama", "/usr/bin/ollama"]
    return next((c for c in candidates if c and os.path.isfile(c)), None)


async def reachable_base(base_url: str, timeout: float = 2.0) -> Optional[str]:
    """The first address (configured, then OLLAMA_HOST) where Ollama answers, or None."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=min(timeout, 1.5)),
                                 **direct_connection_kwargs(base_url)) as client:
        for base in ollama_base_candidates(base_url):
            try:
                r = await client.get(f"{base}/api/version")
                if r.status_code == 200:
                    return base
            except httpx.HTTPError:
                continue
    return None


def _listen_address(base_url: str) -> str:
    """host:port for OLLAMA_HOST so the server listens where Aether is configured to connect."""
    base = ollama_base_candidates(base_url)[0]
    parts = urlsplit(base)
    host = parts.hostname or "127.0.0.1"
    if ":" in host:
        host = f"[{host}]"
    return f"{host}:{parts.port or 11434}"


def _process_alive(pid: int) -> bool:
    try:
        import psutil
        p = psutil.Process(pid)
        if not p.is_running() or p.status() == psutil.STATUS_ZOMBIE:
            return False
        # Make sure the PID was not reused by an unrelated program since it was saved
        return "ollama" in p.name().lower() or any("ollama" in part.lower() for part in p.cmdline())
    except Exception:
        return False


def _adopt_previous() -> None:
    """An Ollama started by an earlier Aether that was killed (not shut down) is still ours to stop later."""
    global _adopted_pid
    if _started is not None or _adopted_pid is not None or not PID_FILE.exists():
        return
    try:
        pid = int(PID_FILE.read_text().strip())
    except (OSError, ValueError):
        pid = 0
    if pid and _process_alive(pid):
        _adopted_pid = pid
    else:
        PID_FILE.unlink(missing_ok=True)


def _log_tail(lines: int = 6) -> str:
    try:
        text = LOG_FILE.read_text(encoding="utf-8", errors="replace").strip().splitlines()
        return "\n".join(text[-lines:])
    except OSError:
        return ""


async def ensure_running(base_url: str, wait: bool = True) -> Dict[str, Any]:
    """Make sure Ollama answers at `base_url`, starting it if needed.

    Returns {"status": "running" | "started" | "starting" | "not_installed" | "remote" | "disabled" | "failed",
             "base_url": ..., "error": ...}.
    """
    global _started
    found = await reachable_base(base_url)
    if found:
        return {"status": "running", "base_url": found, "started_by_aether": started_by_aether()}
    if not _is_local(base_url):
        return {"status": "remote", "base_url": base_url,
                "error": "Ollama 端點不在這台電腦上，無法自動啟動，請到該主機開啟 Ollama。"}
    if not autostart_enabled():
        return {"status": "disabled", "base_url": base_url}

    async with _lock:
        # Another request may have started it while this one waited for the lock
        found = await reachable_base(base_url)
        if found:
            return {"status": "running", "base_url": found, "started_by_aether": started_by_aether()}

        if _started is None or _started.poll() is not None:
            exe = find_ollama_executable()
            if not exe:
                return {"status": "not_installed", "base_url": base_url,
                        "download_url": "https://ollama.com/download"}
            env = dict(os.environ)
            env["OLLAMA_HOST"] = _listen_address(base_url)
            env.setdefault("OLLAMA_FLASH_ATTENTION", "false")
            kwargs: Dict[str, Any] = {}
            if os.name == "nt":
                kwargs["creationflags"] = (getattr(subprocess, "CREATE_NO_WINDOW", 0)
                                           | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
            else:
                kwargs["start_new_session"] = True
            try:
                LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
                log = open(LOG_FILE, "ab")
                _started = subprocess.Popen([exe, "serve"], env=env, stdin=subprocess.DEVNULL, stdout=log,
                                            stderr=subprocess.STDOUT, **kwargs)
                log.close()
                PID_FILE.write_text(str(_started.pid))
                print(f"[Ollama] 已在背景啟動 Ollama（PID {_started.pid}，{env['OLLAMA_HOST']}）")
            except OSError as e:
                _started = None
                return {"status": "failed", "base_url": base_url, "error": f"無法啟動 Ollama：{e}"}

        if not wait:
            return {"status": "starting", "base_url": base_url}

        deadline = time.monotonic() + START_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            await asyncio.sleep(0.4)
            found = await reachable_base(base_url, timeout=1.0)
            if found:
                return {"status": "started", "base_url": found, "started_by_aether": True}
            if _started is not None and _started.poll() is not None:
                tail = _log_tail()
                _forget_started()
                return {"status": "failed", "base_url": base_url,
                        "error": "Ollama 啟動後立即結束" + (f"：\n{tail}" if tail else "")}
        return {"status": "failed", "base_url": base_url,
                "error": f"Ollama 在 {START_TIMEOUT_SECONDS} 秒內沒有回應" + (f"：\n{_log_tail()}" if _log_tail() else "")}


def started_by_aether() -> bool:
    _adopt_previous()
    return (_started is not None and _started.poll() is None) or (_adopted_pid is not None and _process_alive(_adopted_pid))


def _forget_started() -> None:
    global _started, _adopted_pid
    _started = None
    _adopted_pid = None
    PID_FILE.unlink(missing_ok=True)


def stop_started() -> bool:
    """Stop the Ollama this app started (with the model runners it spawned). Returns True if one was stopped."""
    _adopt_previous()
    pid = _started.pid if _started is not None and _started.poll() is None else _adopted_pid
    if not pid:
        _forget_started()
        return False
    try:
        import psutil
        parent = psutil.Process(pid)
        procs = parent.children(recursive=True) + [parent]
        for p in procs:
            try:
                p.terminate()
            except psutil.Error:
                pass
        _, alive = psutil.wait_procs(procs, timeout=5)
        for p in alive:
            try:
                p.kill()
            except psutil.Error:
                pass
        print("[Ollama] 已關閉 Aether 啟動的 Ollama")
        return True
    except Exception as e:
        print(f"[Ollama] 關閉 Ollama 時發生問題：{e}")
        return False
    finally:
        _forget_started()


def recommend_model(hardware: Dict[str, Any]) -> Dict[str, Any]:
    """Pick the largest model that fits: GPU memory when there is a GPU, otherwise a share of system RAM."""
    if hardware.get("gpu_detected") and hardware.get("vram_total_gb"):
        budget = float(hardware["vram_total_gb"])
        basis, memory_gb = "gpu", budget
    else:
        memory_gb = float(hardware.get("ram_total_gb") or 0)
        # CPU-only inference is slow, so stay small even with plenty of RAM
        budget = min(memory_gb / 4, 4.0)
        basis = "cpu"
    choice = next(m for m in MODEL_CHOICES if budget >= m["min_vram_gb"])
    return {**choice, "basis": basis, "memory_gb": round(memory_gb)}


async def installed_models(base_url: str) -> List[str]:
    async with httpx.AsyncClient(timeout=5.0, **direct_connection_kwargs(base_url)) as client:
        r = await client.get(f"{base_url}/api/tags")
        r.raise_for_status()
        return [m.get("name") for m in r.json().get("models", []) if m.get("name")]


async def pull_model(base_url: str, name: str) -> AsyncGenerator[Dict[str, Any], None]:
    """Download a model, yielding {"status", "completed", "total", "percent"} as Ollama reports progress."""
    timeout = httpx.Timeout(None, connect=5.0)
    async with httpx.AsyncClient(timeout=timeout, **direct_connection_kwargs(base_url)) as client:
        async with client.stream("POST", f"{base_url}/api/pull", json={"model": name, "stream": True}) as resp:
            if resp.status_code != 200:
                body = (await resp.aread()).decode("utf-8", errors="replace")
                yield {"status": "error", "error": f"Ollama 回應 {resp.status_code}：{body[:300]}"}
                return
            async for line in resp.aiter_lines():
                if not line.strip():
                    continue
                try:
                    data = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if data.get("error"):
                    yield {"status": "error", "error": data["error"]}
                    return
                total = data.get("total") or 0
                completed = data.get("completed") or 0
                yield {
                    "status": data.get("status", ""),
                    "completed": completed,
                    "total": total,
                    "percent": round(completed * 100 / total, 1) if total else None,
                }

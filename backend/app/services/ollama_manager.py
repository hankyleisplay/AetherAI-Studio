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
# Ollama's first start on Windows (GPU discovery, antivirus scan) can take a minute or more
START_TIMEOUT_SECONDS = 120

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
_started_at: Optional[float] = None


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
        global _started_at
        _adopted_pid = pid
        _started_at = _started_at or time.monotonic()
    else:
        PID_FILE.unlink(missing_ok=True)


def _log_tail(lines: int = 6) -> str:
    try:
        text = LOG_FILE.read_text(encoding="utf-8", errors="replace").strip().splitlines()
        return "\n".join(text[-lines:])
    except OSError:
        return ""


def _launch_alive() -> bool:
    """An Ollama process this app launched (or adopted) is still running."""
    _adopt_previous()
    if _started is not None:
        return _started.poll() is None
    return _adopted_pid is not None and _process_alive(_adopted_pid)


def _starting_state(base_url: str) -> Dict[str, Any]:
    elapsed = int(time.monotonic() - _started_at) if _started_at else 0
    state: Dict[str, Any] = {"status": "starting", "base_url": base_url, "elapsed": elapsed, "log_tail": _log_tail(4)}
    if elapsed > START_TIMEOUT_SECONDS:
        state.update(status="failed",
                     error=f"Ollama 已啟動 {elapsed} 秒仍沒有回應" + (f"：\n{state['log_tail']}" if state["log_tail"] else ""))
    return state


def _launch(base_url: str) -> Optional[Dict[str, Any]]:
    """Start `ollama serve`. Returns an error state, or None when it was launched."""
    global _started, _started_at
    exe = find_ollama_executable()
    if not exe:
        return {"status": "not_installed", "base_url": base_url, "download_url": "https://ollama.com/download"}
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
        # Fresh log per start, so an old failure is never reported as the current one
        log = open(LOG_FILE, "wb")
        _started = subprocess.Popen([exe, "serve"], env=env, stdin=subprocess.DEVNULL, stdout=log,
                                    stderr=subprocess.STDOUT, **kwargs)
        log.close()
        _started_at = time.monotonic()
        PID_FILE.write_text(str(_started.pid))
        print(f"[Ollama] 已在背景啟動 Ollama（PID {_started.pid}，{env['OLLAMA_HOST']}）")
        return None
    except OSError as e:
        _started = None
        return {"status": "failed", "base_url": base_url, "error": f"無法啟動 Ollama：{e}"}


async def ensure_running(base_url: str, wait: bool = True, timeout: float = START_TIMEOUT_SECONDS) -> Dict[str, Any]:
    """Make sure Ollama answers at `base_url`, starting it if needed.

    With wait=False this returns at once ("starting" while Ollama boots), so the UI can poll instead of a request
    hanging for as long as Ollama takes; the lock only guards launching, never the wait.

    Returns {"status": "running" | "started" | "starting" | "not_installed" | "remote" | "disabled" | "failed", ...}.
    """
    found = await reachable_base(base_url)
    if found:
        return {"status": "running", "base_url": found, "started_by_aether": started_by_aether()}
    if not _is_local(base_url):
        return {"status": "remote", "base_url": base_url,
                "error": "Ollama 端點不在這台電腦上，無法自動啟動，請到該主機開啟 Ollama。"}
    if not autostart_enabled():
        return {"status": "disabled", "base_url": base_url}

    async with _lock:
        found = await reachable_base(base_url, timeout=1.0)
        if found:
            return {"status": "running", "base_url": found, "started_by_aether": started_by_aether()}
        if not _launch_alive():
            if _started is not None:
                # The previous launch exited without ever answering: report why instead of looping
                tail = _log_tail()
                _forget_started()
                if not wait:
                    return {"status": "failed", "base_url": base_url,
                            "error": "Ollama 啟動後立即結束" + (f"：\n{tail}" if tail else "")}
            failure = _launch(base_url)
            if failure:
                return failure

    if not wait:
        return _starting_state(base_url)

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        await asyncio.sleep(0.5)
        found = await reachable_base(base_url, timeout=1.0)
        if found:
            return {"status": "started", "base_url": found, "started_by_aether": True}
        if not _launch_alive():
            tail = _log_tail()
            _forget_started()
            return {"status": "failed", "base_url": base_url,
                    "error": "Ollama 啟動後立即結束" + (f"：\n{tail}" if tail else "")}
    state = _starting_state(base_url)
    state.update(status="failed", error=f"Ollama 啟動 {state['elapsed']} 秒後仍沒有回應，請稍後再試")
    return state


def started_by_aether() -> bool:
    _adopt_previous()
    return (_started is not None and _started.poll() is None) or (_adopted_pid is not None and _process_alive(_adopted_pid))


def _forget_started() -> None:
    global _started, _adopted_pid, _started_at
    _started = None
    _adopted_pid = None
    _started_at = None
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


# ---------------------------------------------------------------------------------------------------------------
# Model management
# ---------------------------------------------------------------------------------------------------------------

_show_cache: Dict[str, Dict[str, Any]] = {}
_auto_cache: Dict[str, Dict[str, Any]] = {}


def _client(base_url: str, timeout: float = 10.0) -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=httpx.Timeout(timeout, connect=3.0), **direct_connection_kwargs(base_url))


async def model_info(base_url: str, name: str) -> Dict[str, Any]:
    """/api/show for a model (capabilities, parameters, context length), cached by name + digest."""
    key = f"{base_url}|{name}"
    if key in _show_cache:
        return _show_cache[key]
    async with _client(base_url) as client:
        r = await client.post(f"{base_url}/api/show", json={"model": name})
        r.raise_for_status()
        data = r.json()
    mi = data.get("model_info") or {}
    arch = mi.get("general.architecture")
    info = {
        "capabilities": data.get("capabilities") or [],
        "context_length": mi.get(f"{arch}.context_length") if arch else None,
        "details": data.get("details") or {},
    }
    _show_cache[key] = info
    return info


async def capabilities(base_url: str, name: str) -> List[str]:
    try:
        return (await model_info(base_url, name)).get("capabilities") or []
    except Exception:
        return []


async def list_models_detailed(base_url: str) -> List[Dict[str, Any]]:
    async with _client(base_url) as client:
        r = await client.get(f"{base_url}/api/tags")
        r.raise_for_status()
        raw = r.json().get("models", [])
    sem = asyncio.Semaphore(4)

    async def one(m: Dict[str, Any]) -> Dict[str, Any]:
        name = m.get("name") or m.get("model")
        details = m.get("details") or {}
        async with sem:
            caps = await capabilities(base_url, name)
        return {
            "name": name,
            "size_bytes": m.get("size") or 0,
            "modified_at": m.get("modified_at"),
            "parameter_size": details.get("parameter_size"),
            "quantization": details.get("quantization_level"),
            "family": details.get("family"),
            "capabilities": caps,
        }

    return list(await asyncio.gather(*(one(m) for m in raw if m.get("name") or m.get("model"))))


async def loaded_models(base_url: str) -> List[Dict[str, Any]]:
    async with _client(base_url) as client:
        r = await client.get(f"{base_url}/api/ps")
        r.raise_for_status()
        out = []
        for m in r.json().get("models", []):
            size = m.get("size") or 0
            vram = m.get("size_vram") or 0
            out.append({
                "name": m.get("name") or m.get("model"),
                "size_bytes": size,
                "vram_bytes": vram,
                "gpu_percent": round(vram * 100 / size) if size else None,
                "context_length": m.get("context_length"),
                "expires_at": m.get("expires_at"),
            })
        return out


async def delete_model(base_url: str, name: str) -> None:
    async with _client(base_url) as client:
        r = await client.request("DELETE", f"{base_url}/api/delete", json={"model": name})
        if r.status_code not in (200, 204):
            raise RuntimeError(r.text[:300] or f"HTTP {r.status_code}")
    for key in [k for k in _show_cache if k.endswith(f"|{name}")]:
        _show_cache.pop(key, None)
    _auto_cache.pop(f"{base_url}|{name}", None)


async def load_model(base_url: str, name: str, num_ctx: Optional[int], keep_alive: str) -> None:
    """Load a model into memory with the same context size chat will use (a different size forces a reload)."""
    body: Dict[str, Any] = {"model": name, "keep_alive": keep_alive}
    if num_ctx:
        body["options"] = {"num_ctx": int(num_ctx)}
    async with _client(base_url, timeout=300.0) as client:
        r = await client.post(f"{base_url}/api/generate", json=body)
        if r.status_code != 200:
            raise RuntimeError(r.text[:300] or f"HTTP {r.status_code}")


async def unload_model(base_url: str, name: str) -> None:
    async with _client(base_url) as client:
        r = await client.post(f"{base_url}/api/generate", json={"model": name, "keep_alive": 0})
        if r.status_code != 200:
            raise RuntimeError(r.text[:300] or f"HTTP {r.status_code}")


async def auto_settings(base_url: str, name: str, fallback_ctx: int, fallback_max: int) -> Dict[str, int]:
    """Context window / max output that keep this model on the GPU, from the hardware evaluator.

    Worked out once per model and then kept: changing num_ctx between requests makes Ollama reload the model.
    """
    key = f"{base_url}|{name}"
    if key in _auto_cache:
        return _auto_cache[key]
    result = {"context_window": int(fallback_ctx or 8192), "max_tokens": int(fallback_max or 4096), "source": "fallback"}
    try:
        from backend.app.services.hardware import evaluate_generation_settings, get_hardware_info
        await asyncio.to_thread(get_hardware_info)  # warm the cache off the event loop (nvidia-smi can be slow)
        ev = await evaluate_generation_settings("ollama", name, base_url, 32768, int(fallback_max or 4096))
        rec = ev.get("recommended") or {}
        if rec.get("context_window"):
            ctx = int(rec["context_window"])
            if not (ev.get("hardware") or {}).get("gpu_detected"):
                # On the CPU every extra token of context costs prompt time; keep it moderate
                ctx = min(ctx, 8192)
            result = {"context_window": ctx, "max_tokens": int(min(rec.get("max_tokens") or ctx // 2, ctx // 2 or 1024)),
                      "source": "auto"}
    except Exception as e:
        print(f"[Ollama] 自動參數評估失敗，使用目前設定：{e}")
    if result["source"] == "auto":
        # Only a real evaluation is kept; a fallback (Ollama busy, model unknown) is retried next time
        _auto_cache[key] = result
    return result


def forget_auto_settings(base_url: Optional[str] = None, name: Optional[str] = None) -> None:
    if base_url and name:
        _auto_cache.pop(f"{base_url}|{name}", None)
    else:
        _auto_cache.clear()


async def chat_context(base_url: str, cfg: Dict[str, Any]) -> int:
    """The num_ctx chat requests will use for this config (preloading with any other size wastes the load)."""
    ctx = int(cfg.get("context_window") or 4096)
    if cfg.get("auto_tune", True):
        auto = await auto_settings(base_url, cfg.get("model") or "", ctx, int(cfg.get("max_tokens") or 4096))
        ctx = auto["context_window"]
    return ctx


async def preload(base_url: str, cfg: Dict[str, Any]) -> Dict[str, Any]:
    """Load the active model ahead of the first message so it does not pay the load time."""
    from backend.app.llm.provider import OLLAMA_KEEP_ALIVE
    name = cfg.get("model") or ""
    if not name:
        return {"status": "skipped"}
    found = await reachable_base(base_url)
    if not found:
        return {"status": "unreachable"}
    ctx = await chat_context(found, cfg)
    started = time.monotonic()
    await load_model(found, name, ctx, OLLAMA_KEEP_ALIVE)
    return {"status": "loaded", "model": name, "num_ctx": ctx, "seconds": round(time.monotonic() - started, 1)}


async def preload_quietly(base_url: str, cfg: Dict[str, Any], wait_for_start: bool = False) -> None:
    try:
        if wait_for_start:
            state = await ensure_running(base_url, wait=True)
            if state.get("status") not in ("running", "started"):
                return
            base_url = state["base_url"]
        result = await preload(base_url, cfg)
        if result.get("status") == "loaded":
            print(f"[Ollama] 已預先載入 {result['model']}（num_ctx {result['num_ctx']}，{result['seconds']} 秒）")
    except Exception as e:
        print(f"[Ollama] 預先載入略過：{e}")

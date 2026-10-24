"""
Hardware capability evaluation for model generation settings.

Estimates how much memory a (model, context_window, max_tokens) combination needs and compares it
with the GPU / system memory actually available. When a local model does not fit in VRAM, Ollama and
llama.cpp silently offload layers to the CPU and generation becomes several times slower, so this is
what the settings panel uses to warn the user before they save an oversized context window.

Issues are returned as codes + params (not sentences) so the frontend can translate them.
"""
import math
import platform
import re
import subprocess
import time
from typing import Any, Dict, List, Optional

import httpx

GB = 1024 ** 3
LOCAL_PROVIDERS = {"ollama", "lm_studio", "openai_compatible"}

_gpu_cache: Dict[str, Any] = {"ts": 0.0, "data": None}
_show_cache: Dict[str, Dict[str, Any]] = {}


def _query_nvidia() -> Optional[Dict[str, Any]]:
    try:
        res = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total,memory.used", "--format=csv,noheader,nounits"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=4,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)
        )
    except Exception:
        return None
    if res.returncode != 0 or not res.stdout.strip():
        return None
    names, total_mb, used_mb = [], 0.0, 0.0
    for line in res.stdout.strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 3:
            continue
        try:
            total_mb += float(parts[1])
            used_mb += float(parts[2])
            names.append(parts[0])
        except ValueError:
            continue
    if not names:
        return None
    return {
        "gpu_name": " + ".join(names),
        "gpu_count": len(names),
        "vram_total_gb": round(total_mb / 1024, 2),
        "vram_used_gb": round(used_mb / 1024, 2),
    }


def get_hardware_info() -> Dict[str, Any]:
    """System RAM + GPU VRAM snapshot (GPU query cached for 10s; nvidia-smi is slow to start)."""
    info: Dict[str, Any] = {
        "gpu_detected": False,
        "gpu_name": None,
        "vram_total_gb": 0.0,
        "vram_used_gb": 0.0,
        "unified_memory": False,
        "ram_total_gb": 0.0,
        "ram_available_gb": 0.0,
        "cpu_count": None,
    }
    try:
        import psutil
        vm = psutil.virtual_memory()
        info["ram_total_gb"] = round(vm.total / GB, 2)
        info["ram_available_gb"] = round(vm.available / GB, 2)
        info["cpu_count"] = psutil.cpu_count(logical=True)
    except Exception:
        pass

    # Apple Silicon: GPU shares system memory; macOS lets Metal use roughly 75% of it
    if platform.system() == "Darwin" and platform.machine() in ("arm64", "aarch64"):
        info.update({
            "gpu_detected": True,
            "gpu_name": "Apple Silicon (Unified Memory)",
            "unified_memory": True,
            "vram_total_gb": round(info["ram_total_gb"] * 0.75, 2),
            "vram_used_gb": round(max(0.0, info["ram_total_gb"] - info["ram_available_gb"]) * 0.75, 2),
        })
        return info

    now = time.time()
    if now - _gpu_cache["ts"] > 10:
        _gpu_cache["data"] = _query_nvidia()
        _gpu_cache["ts"] = now
    gpu = _gpu_cache["data"]
    if gpu:
        info.update(gpu)
        info["gpu_detected"] = True
    return info


def _params_from_name(name: str) -> Optional[float]:
    """Parse parameter count (billions) from names like 'qwen2.5:7b', 'llama3-70b', 'gemma4:e4b'."""
    m = re.search(r"(?:^|[:\-_/ ])e?(\d+(?:\.\d+)?)\s*b(?:$|[:\-_\. ])", name.lower())
    if m:
        try:
            return float(m.group(1))
        except ValueError:
            return None
    return None


async def _ollama_model_details(base_url: str, model: str) -> Dict[str, Any]:
    """Architecture + file size for an installed Ollama model, plus what is currently loaded."""
    base = base_url.rstrip("/")
    out: Dict[str, Any] = {"show": None, "size_bytes": None, "loaded": None}
    async with httpx.AsyncClient(timeout=httpx.Timeout(6.0, connect=2.0)) as client:
        try:
            tags = await client.get(f"{base}/api/tags")
            if tags.status_code == 200:
                for m in tags.json().get("models", []):
                    if m.get("name") == model or m.get("model") == model:
                        out["size_bytes"] = m.get("size")
                        break
        except Exception:
            pass

        cache_key = f"{base}|{model}"
        if cache_key in _show_cache:
            out["show"] = _show_cache[cache_key]
        else:
            try:
                show = await client.post(f"{base}/api/show", json={"model": model})
                if show.status_code == 200:
                    data = show.json()
                    # Drop the huge tokenizer arrays before caching
                    raw_mi = data.get("model_info") or {}
                    mi = {k: v for k, v in raw_mi.items() if not isinstance(v, list)}
                    tokens = raw_mi.get("tokenizer.ggml.tokens")
                    if isinstance(tokens, list) and tokens:
                        mi["tokenizer.vocab_size"] = len(tokens)
                    out["show"] = {"model_info": mi, "details": data.get("details") or {}}
                    _show_cache[cache_key] = out["show"]
            except Exception:
                pass

        try:
            ps = await client.get(f"{base}/api/ps")
            if ps.status_code == 200:
                loaded_all = ps.json().get("models", []) or []
                out["loaded_all"] = loaded_all
                for m in loaded_all:
                    if m.get("name") == model or m.get("model") == model:
                        out["loaded"] = m
                        break
        except Exception:
            pass
    return out


def _kv_bytes_per_token(mi: Dict[str, Any], ctx: int) -> Optional[float]:
    """Average f16 KV-cache bytes per context token derived from GGUF metadata."""
    arch = mi.get("general.architecture")
    if not arch:
        return None
    g = lambda key, default=None: mi.get(f"{arch}.{key}", default)
    layers = g("block_count")
    heads = g("attention.head_count")
    kv_heads = g("attention.head_count_kv") or heads
    emb = g("embedding_length")
    if isinstance(kv_heads, list) or isinstance(heads, list):
        return None
    if not layers or not heads or not emb:
        return None
    head_dim = emb / heads
    k_len = g("attention.key_length") or head_dim
    v_len = g("attention.value_length") or head_dim

    # Layers that reuse another layer's cache store nothing themselves
    kv_layers = max(1, layers - int(g("attention.shared_kv_layers") or 0))
    window = g("attention.sliding_window")
    if window and window < ctx:
        # Interleaved sliding-window attention (Gemma 2/3/4 style): only ~1 in 6 layers sees the full context
        global_layers = max(1, math.ceil(kv_layers / 6))
        swa_layers = kv_layers - global_layers
        k_swa = g("attention.key_length_swa") or k_len
        v_swa = g("attention.value_length_swa") or v_len
        total = (global_layers * kv_heads * (k_len + v_len) * 2 * ctx
                 + swa_layers * kv_heads * (k_swa + v_swa) * 2 * window)
        return total / ctx
    return kv_layers * kv_heads * (k_len + v_len) * 2


def _estimate_memory_gb(weights_gb: float, kv_per_token: float, ctx: int) -> Dict[str, float]:
    kv_gb = kv_per_token * ctx / GB
    # CUDA/Metal context + compute graph buffers; grows slightly with context length
    overhead_gb = 0.6 + 0.06 * (ctx / 4096)
    return {
        "weights_gb": round(weights_gb, 2),
        "kv_cache_gb": round(kv_gb, 2),
        "overhead_gb": round(overhead_gb, 2),
        "total_gb": round(weights_gb + kv_gb + overhead_gb, 2),
    }


def _largest_fitting_ctx(weights_gb: float, kv_per_token: float, budget_gb: float, native_ctx: Optional[int]) -> int:
    best = 0
    ctx = 2048
    limit = min(native_ctx or 131072, 131072)
    while ctx <= limit:
        if _estimate_memory_gb(weights_gb, kv_per_token, ctx)["total_gb"] <= budget_gb:
            best = ctx
        else:
            break
        ctx += 2048
    return best


async def evaluate_generation_settings(
    provider: str,
    model: str,
    base_url: str,
    context_window: int,
    max_tokens: int,
) -> Dict[str, Any]:
    provider = (provider or "").lower()
    ctx = int(context_window or 0) or 4096
    mt = int(max_tokens or 0) or 0
    issues: List[Dict[str, Any]] = []

    def issue(code: str, level: str, **params):
        issues.append({"code": code, "level": level, "params": params})

    # Only Ollama receives the context window from this app (num_ctx); other providers manage it themselves
    if provider == "ollama":
        if mt and mt > ctx:
            issue("max_tokens_exceeds_context", "warn", max_tokens=mt, context_window=ctx)
        elif mt and mt > ctx * 0.75:
            issue("max_tokens_crowds_context", "warn", max_tokens=mt, context_window=ctx, remaining=ctx - mt)

    result: Dict[str, Any] = {
        "provider": provider,
        "model": model,
        "local": provider in LOCAL_PROVIDERS,
        "context_window": ctx,
        "max_tokens": mt,
        "hardware": None,
        "model_info": None,
        "estimate": None,
        "loaded": None,
        "issues": issues,
        "recommended": None,
        "verdict": "ok",
    }

    if provider not in LOCAL_PROVIDERS:
        result["verdict"] = "cloud"
        return result

    hw = get_hardware_info()
    result["hardware"] = hw

    # ---- Model size / architecture -------------------------------------------------------------
    weights_gb: Optional[float] = None
    kv_per_token: Optional[float] = None
    native_ctx: Optional[int] = None
    params_b: Optional[float] = None
    source = "unknown"

    if provider == "ollama" and model:
        details = await _ollama_model_details(base_url or "http://localhost:11434", model)
        show = details.get("show") or {}
        mi = show.get("model_info") or {}
        arch = mi.get("general.architecture")
        if details.get("size_bytes"):
            weights_gb = details["size_bytes"] / GB
        if mi.get("general.parameter_count"):
            params_b = mi["general.parameter_count"] / 1e9
        if arch and mi.get(f"{arch}.context_length"):
            native_ctx = int(mi[f"{arch}.context_length"])
        ple_dim = mi.get(f"{arch}.embedding_length_per_layer_input") if arch else None
        if weights_gb and params_b and ple_dim and mi.get(f"{arch}.block_count"):
            # Per-layer-embedding models (Gemma 3n / Gemma 4 "E" series) keep the PLE table in CPU RAM,
            # so only the remaining weights occupy VRAM.
            vocab = mi.get("tokenizer.vocab_size") or 262144
            ple_params = mi[f"{arch}.block_count"] * ple_dim * vocab
            bytes_per_param = details["size_bytes"] / (params_b * 1e9)
            weights_gb = max(weights_gb * 0.3, weights_gb - ple_params * bytes_per_param / GB)
        kv_per_token = _kv_bytes_per_token(mi, ctx) if mi else None
        if weights_gb and kv_per_token:
            source = "ollama"
        loaded = details.get("loaded")
        if loaded:
            size = loaded.get("size") or 0
            size_vram = loaded.get("size_vram") or 0
            result["loaded"] = {
                "size_gb": round(size / GB, 2),
                "size_vram_gb": round(size_vram / GB, 2),
                "gpu_pct": round(100 * size_vram / size, 1) if size else None,
                "context_length": loaded.get("context_length"),
            }
        # VRAM held by other Ollama models would be released for this one, so don't count it as "used"
        ollama_vram = sum(
            (m.get("size_vram") or 0) for m in details.get("loaded_all", []) or [] if m is not loaded
        ) / GB
    else:
        loaded = None
        ollama_vram = 0.0

    if params_b is None:
        params_b = _params_from_name(model or "")
    if weights_gb is None and params_b:
        # ~Q4_K_M density incl. embeddings
        weights_gb = params_b * 0.62
        source = "estimated"
    if kv_per_token is None and params_b:
        # Typical GQA model: ~128KB/token at 7-8B, ~256KB at 32B, ~330KB at 70B
        kv_per_token = 131072 * max(0.25, (params_b / 7.5) ** 0.5)
        if source == "ollama":
            source = "estimated"

    result["model_info"] = {
        "params_b": round(params_b, 2) if params_b else None,
        "weights_gb": round(weights_gb, 2) if weights_gb else None,
        "native_context": native_ctx,
        "kv_mb_per_1k_tokens": round(kv_per_token * 1024 / (1024 ** 2), 1) if kv_per_token else None,
        "source": source,
    }

    if native_ctx and ctx > native_ctx:
        issue("context_exceeds_model", "warn", context_window=ctx, native_context=native_ctx)

    if not weights_gb or not kv_per_token:
        issue("model_size_unknown", "info")
        result["verdict"] = "danger" if any(i["level"] == "danger" for i in issues) else "unknown"
        return result

    est = _estimate_memory_gb(weights_gb, kv_per_token, ctx)
    result["estimate"] = est

    if loaded:
        # This model is already resident: its memory comes back when it reloads with the new settings.
        # Some Ollama builds under-report size_vram for multimodal models, so never credit less than
        # what our own estimate says the loaded configuration occupies.
        reported = (loaded.get("size_vram") or 0) / GB
        loaded_ctx = loaded.get("context_length") or ctx
        ollama_vram += max(reported, _estimate_memory_gb(weights_gb, kv_per_token, loaded_ctx)["total_gb"]
                           if reported < weights_gb * 0.5 else reported)

    if hw["gpu_detected"]:
        vram_free = max(0.0, hw["vram_total_gb"] - hw["vram_used_gb"] + ollama_vram)
        vram_free = min(vram_free, hw["vram_total_gb"])
        budget = vram_free * 0.95
        gpu_pct = 100.0 if est["total_gb"] <= budget else max(0.0, 100.0 * budget / est["total_gb"])
        est["gpu_fit_pct"] = round(gpu_pct, 1)
        est["vram_free_gb"] = round(vram_free, 2)
        if est["total_gb"] > budget:
            spill = est["total_gb"] - budget
            if spill > hw["ram_available_gb"]:
                issue("exceeds_total_memory", "danger", needed_gb=est["total_gb"],
                      vram_gb=round(vram_free, 1), ram_gb=hw["ram_available_gb"])
            else:
                issue("vram_spill", "warn", needed_gb=est["total_gb"], vram_gb=round(vram_free, 1),
                      gpu_pct=round(gpu_pct))
        if weights_gb > budget:
            issue("weights_exceed_vram", "warn", weights_gb=round(weights_gb, 1), vram_gb=round(vram_free, 1))
    else:
        budget = hw["ram_available_gb"] * 0.9
        issue("no_gpu_detected", "info")
        if est["total_gb"] > budget:
            issue("exceeds_total_memory", "danger", needed_gb=est["total_gb"], vram_gb=0,
                  ram_gb=hw["ram_available_gb"])

    loaded = result["loaded"]
    if loaded and loaded.get("gpu_pct") is not None and loaded["gpu_pct"] < 99:
        issue("currently_offloaded", "warn", gpu_pct=loaded["gpu_pct"],
              context_length=loaded.get("context_length"))

    # Largest context that stays fully on the GPU, capped where longer prompts mostly just cost prefill time.
    # If even the minimum doesn't fit, recommend the minimum: it keeps the CPU-offloaded share smallest.
    rec_ctx = min(_largest_fitting_ctx(weights_gb, kv_per_token, budget, native_ctx), 32768) or 2048
    rec_mt = min(mt or 4096, max(1024, rec_ctx // 2))
    result["recommended"] = {"context_window": rec_ctx, "max_tokens": rec_mt}

    levels = {i["level"] for i in issues}
    result["verdict"] = "danger" if "danger" in levels else ("warn" if "warn" in levels else "ok")
    return result

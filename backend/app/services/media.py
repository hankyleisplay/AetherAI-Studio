"""
Image and video generation.

Image providers
  pollinations  free public API, no key (prompt is sent to image.pollinations.ai)
  openai        OpenAI Images API (gpt-image-1), needs an OpenAI API key
  gemini        Google Imagen via the Gemini API, needs a Gemini API key
  sd_webui      local Stable Diffusion (AUTOMATIC1111 / Forge) txt2img API

Video providers (long-running: started as a background job and polled)
  gemini_veo    Google Veo via the Gemini API, needs a Gemini API key
  openai_sora   OpenAI Sora (videos API), needs an OpenAI API key

Files are written to <workspace>/media and indexed in the media_items table.
"""
import asyncio
import re
import base64
import time
import urllib.parse
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import httpx

from backend.app.config import settings
from backend.app.storage.database import db

IMAGE_PROVIDERS = ["pollinations", "openai", "gemini", "sd_webui"]
VIDEO_PROVIDERS = ["gemini_veo", "openai_sora"]

DEFAULT_CONFIG: Dict[str, Any] = {
    "image_provider": "pollinations",
    "video_provider": "gemini_veo",
    "openai_api_key": "",
    "gemini_api_key": "",
    "sd_base_url": "http://127.0.0.1:7860",
    "openai_image_model": "gpt-image-1",
    "gemini_image_model": "imagen-4.0-generate-001",
    "veo_model": "veo-3.0-fast-generate-001",
    "sora_model": "sora-2",
}

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"
OPENAI_BASE = "https://api.openai.com/v1"
VIDEO_TIMEOUT_S = 15 * 60

_running_jobs: Dict[str, asyncio.Task] = {}


class MediaError(Exception):
    pass


def media_dir() -> Path:
    d = settings.base_workspace_dir.resolve() / "media"
    d.mkdir(parents=True, exist_ok=True)
    return d


def get_config(include_secrets: bool = True) -> Dict[str, Any]:
    cfg = {**DEFAULT_CONFIG, **(db.get_setting("media_config") or {})}
    if not include_secrets:
        for k in ("openai_api_key", "gemini_api_key"):
            cfg[f"has_{k}"] = bool(cfg.get(k)) or bool(_fallback_key(k))
            cfg[k] = ""
    return cfg


def save_config(update: Dict[str, Any]) -> Dict[str, Any]:
    cfg = {**DEFAULT_CONFIG, **(db.get_setting("media_config") or {})}
    for k, v in update.items():
        if k not in DEFAULT_CONFIG or v is None:
            continue
        # Empty key fields from the UI mean "keep the stored key" (keys are never sent back to the browser)
        if k.endswith("_api_key") and v == "":
            continue
        cfg[k] = v.strip() if isinstance(v, str) else v
    db.set_setting("media_config", cfg)
    return get_config(include_secrets=False)


def _fallback_key(name: str) -> str:
    """Reuse the chat model's API key when it is for the same provider."""
    active = db.get_setting("active_model_config") or {}
    provider = (active.get("provider") or "").lower()
    if name == "openai_api_key" and provider == "openai":
        return active.get("api_key") or ""
    if name == "gemini_api_key" and provider == "gemini":
        return active.get("api_key") or ""
    return ""


def _key(cfg: Dict[str, Any], name: str, label: str) -> str:
    key = cfg.get(name) or _fallback_key(name)
    if not key:
        raise MediaError(f"{label} API key is not set. Add it in Media Studio settings.")
    return key


def _save_bytes(media_id: str, data: bytes, ext: str) -> str:
    name = f"{media_id}.{ext}"
    (media_dir() / name).write_bytes(data)
    return name


def _sniff_ext(data: bytes, default: str = "png") -> str:
    if data[:3] == b"\xff\xd8\xff":
        return "jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return default


def _size(aspect: str) -> Tuple[int, int]:
    return {"1:1": (1024, 1024), "16:9": (1344, 768), "9:16": (768, 1344), "4:3": (1152, 864), "3:4": (864, 1152)}.get(aspect, (1024, 1024))


def _error_text(r: httpx.Response) -> str:
    try:
        j = r.json()
        msg = j.get("error", {}).get("message") if isinstance(j.get("error"), dict) else j.get("error") or j.get("detail")
        return f"HTTP {r.status_code}: {msg or r.text[:300]}"
    except Exception:
        return f"HTTP {r.status_code}: {r.text[:300]}"


# ------------------------------------------------------------------ images
async def _image_pollinations(prompt: str, aspect: str, seed: Optional[int]) -> Tuple[bytes, str]:
    w, h = _size(aspect)
    params = {"width": w, "height": h, "nologo": "true", "model": "flux"}
    if seed is not None:
        params["seed"] = seed
    url = "https://image.pollinations.ai/prompt/" + urllib.parse.quote(prompt) + "?" + urllib.parse.urlencode(params)
    async with httpx.AsyncClient(timeout=180, follow_redirects=True) as client:
        r = await client.get(url)
        # The free tier is rate-limited per IP ("Retry after Ns"); wait as advised instead of failing,
        # up to about 100 s in total
        waited = 0
        for _ in range(3):
            if r.status_code not in (402, 429, 503):
                break
            m = re.search(r"[Rr]etry after (\d+)\s*s", r.text)
            wait = int(m.group(1)) + 3 if m else 15
            if waited + wait > 100:
                break
            await asyncio.sleep(wait)
            waited += wait
            r = await client.get(url)
    if r.status_code != 200 or not r.headers.get("content-type", "").startswith("image"):
        hint = " The free Pollinations tier allows about one image per 45 seconds." if r.status_code in (402, 429, 503) else ""
        raise MediaError(f"Pollinations: {_error_text(r)}{hint}")
    return r.content, "flux"


async def _image_openai(cfg: Dict[str, Any], prompt: str, aspect: str) -> Tuple[bytes, str]:
    key = _key(cfg, "openai_api_key", "OpenAI")
    size = {"16:9": "1536x1024", "4:3": "1536x1024", "9:16": "1024x1536", "3:4": "1024x1536"}.get(aspect, "1024x1024")
    model = cfg.get("openai_image_model") or "gpt-image-1"
    async with httpx.AsyncClient(timeout=240) as client:
        r = await client.post(f"{OPENAI_BASE}/images/generations", headers={"Authorization": f"Bearer {key}"},
                              json={"model": model, "prompt": prompt, "size": size, "n": 1})
    if r.status_code != 200:
        raise MediaError(f"OpenAI: {_error_text(r)}")
    item = (r.json().get("data") or [{}])[0]
    if item.get("b64_json"):
        return base64.b64decode(item["b64_json"]), model
    if item.get("url"):
        async with httpx.AsyncClient(timeout=120) as client:
            return (await client.get(item["url"])).content, model
    raise MediaError("OpenAI returned no image.")


async def _image_gemini(cfg: Dict[str, Any], prompt: str, aspect: str) -> Tuple[bytes, str]:
    key = _key(cfg, "gemini_api_key", "Gemini")
    model = cfg.get("gemini_image_model") or "imagen-4.0-generate-001"
    async with httpx.AsyncClient(timeout=240) as client:
        r = await client.post(f"{GEMINI_BASE}/models/{model}:predict", headers={"x-goog-api-key": key},
                              json={"instances": [{"prompt": prompt}],
                                    "parameters": {"sampleCount": 1, "aspectRatio": aspect if aspect in ("1:1", "16:9", "9:16", "4:3", "3:4") else "1:1"}})
    if r.status_code != 200:
        raise MediaError(f"Gemini Imagen: {_error_text(r)}")
    preds = r.json().get("predictions") or []
    if not preds or not preds[0].get("bytesBase64Encoded"):
        raise MediaError("Gemini returned no image (the prompt may have been blocked by safety filters).")
    return base64.b64decode(preds[0]["bytesBase64Encoded"]), model


async def _image_sd(cfg: Dict[str, Any], prompt: str, aspect: str, negative: str, seed: Optional[int]) -> Tuple[bytes, str]:
    base = (cfg.get("sd_base_url") or "http://127.0.0.1:7860").rstrip("/")
    w, h = _size(aspect)
    # SD 1.5/SDXL work best near their native sizes
    scale = 768 / max(w, h)
    payload = {"prompt": prompt, "negative_prompt": negative or "", "width": int(w * scale) // 8 * 8,
               "height": int(h * scale) // 8 * 8, "steps": 25, "seed": seed if seed is not None else -1}
    try:
        async with httpx.AsyncClient(timeout=600) as client:
            r = await client.post(f"{base}/sdapi/v1/txt2img", json=payload)
    except httpx.ConnectError:
        raise MediaError(f"Cannot reach Stable Diffusion WebUI at {base}. Start it with the --api flag.")
    if r.status_code != 200:
        raise MediaError(f"Stable Diffusion: {_error_text(r)}")
    images = r.json().get("images") or []
    if not images:
        raise MediaError("Stable Diffusion returned no image.")
    return base64.b64decode(images[0].split(",", 1)[-1]), "sd-webui"


async def generate_image(prompt: str, provider: Optional[str] = None, aspect: str = "1:1",
                         negative_prompt: str = "", seed: Optional[int] = None) -> Dict[str, Any]:
    prompt = (prompt or "").strip()
    if not prompt:
        raise MediaError("Prompt is empty.")
    cfg = get_config()
    provider = provider or cfg["image_provider"]
    if provider not in IMAGE_PROVIDERS:
        raise MediaError(f"Unknown image provider '{provider}'.")
    # Fail fast on a missing key instead of leaving a failed entry in the gallery
    if provider == "openai":
        _key(cfg, "openai_api_key", "OpenAI")
    elif provider == "gemini":
        _key(cfg, "gemini_api_key", "Gemini")
    item = db.add_media("image", prompt, provider, status="running", meta={"aspect": aspect})
    try:
        if provider == "pollinations":
            data, model = await _image_pollinations(prompt, aspect, seed)
        elif provider == "openai":
            data, model = await _image_openai(cfg, prompt, aspect)
        elif provider == "gemini":
            data, model = await _image_gemini(cfg, prompt, aspect)
        else:
            data, model = await _image_sd(cfg, prompt, aspect, negative_prompt, seed)
        name = _save_bytes(item["id"], data, _sniff_ext(data))
        db.update_media(item["id"], status="done", file_name=name, model=model)
    except Exception as e:
        db.update_media(item["id"], status="failed", error=str(e)[:1000])
        raise MediaError(str(e)) from e
    return db.get_media(item["id"])


# ------------------------------------------------------------------ videos
async def _video_veo(cfg: Dict[str, Any], media_id: str, prompt: str, aspect: str) -> Tuple[bytes, str]:
    key = _key(cfg, "gemini_api_key", "Gemini")
    model = cfg.get("veo_model") or "veo-3.0-fast-generate-001"
    headers = {"x-goog-api-key": key}
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(f"{GEMINI_BASE}/models/{model}:predictLongRunning", headers=headers,
                              json={"instances": [{"prompt": prompt}],
                                    "parameters": {"aspectRatio": "9:16" if aspect == "9:16" else "16:9"}})
        if r.status_code != 200:
            raise MediaError(f"Veo: {_error_text(r)}")
        op_name = r.json().get("name")
        if not op_name:
            raise MediaError("Veo did not return an operation id.")
        db.update_media(media_id, meta={"aspect": aspect, "operation": op_name})
        start = time.time()
        while True:
            await asyncio.sleep(10)
            op = (await client.get(f"{GEMINI_BASE}/{op_name}", headers=headers)).json()
            if op.get("error"):
                raise MediaError(f"Veo: {op['error'].get('message', op['error'])}")
            if op.get("done"):
                break
            if time.time() - start > VIDEO_TIMEOUT_S:
                raise MediaError("Veo generation timed out.")
        resp = op.get("response", {})
        samples = (resp.get("generateVideoResponse") or resp).get("generatedSamples") or []
        uri = samples[0].get("video", {}).get("uri") if samples else None
        if not uri:
            raise MediaError("Veo finished without a video (it may have been blocked by safety filters).")
        v = await client.get(uri, headers=headers, follow_redirects=True, timeout=300)
        if v.status_code != 200:
            raise MediaError(f"Veo download: {_error_text(v)}")
        return v.content, model


async def _video_sora(cfg: Dict[str, Any], media_id: str, prompt: str, aspect: str, seconds: int) -> Tuple[bytes, str]:
    key = _key(cfg, "openai_api_key", "OpenAI")
    model = cfg.get("sora_model") or "sora-2"
    headers = {"Authorization": f"Bearer {key}"}
    size = "720x1280" if aspect == "9:16" else "1280x720"
    secs = str(min((4, 8, 12), key=lambda s: abs(s - (seconds or 8))))
    async with httpx.AsyncClient(timeout=120) as client:
        r = await client.post(f"{OPENAI_BASE}/videos", headers=headers,
                              data={"model": model, "prompt": prompt, "size": size, "seconds": secs})
        if r.status_code not in (200, 201):
            raise MediaError(f"Sora: {_error_text(r)}")
        vid = r.json().get("id")
        if not vid:
            raise MediaError("Sora did not return a video id.")
        db.update_media(media_id, meta={"aspect": aspect, "operation": vid, "seconds": secs})
        start = time.time()
        while True:
            await asyncio.sleep(10)
            j = (await client.get(f"{OPENAI_BASE}/videos/{vid}", headers=headers)).json()
            status = j.get("status")
            if status == "failed":
                raise MediaError(f"Sora: {(j.get('error') or {}).get('message', 'generation failed')}")
            if status == "completed":
                break
            if time.time() - start > VIDEO_TIMEOUT_S:
                raise MediaError("Sora generation timed out.")
            if j.get("progress") is not None:
                db.update_media(media_id, meta={"aspect": aspect, "operation": vid, "seconds": secs, "progress": j.get("progress")})
        v = await client.get(f"{OPENAI_BASE}/videos/{vid}/content", headers=headers, follow_redirects=True, timeout=300)
        if v.status_code != 200:
            raise MediaError(f"Sora download: {_error_text(v)}")
        return v.content, model


async def _run_video_job(media_id: str, provider: str, prompt: str, aspect: str, seconds: int):
    cfg = get_config()
    try:
        if provider == "gemini_veo":
            data, model = await _video_veo(cfg, media_id, prompt, aspect)
        else:
            data, model = await _video_sora(cfg, media_id, prompt, aspect, seconds)
        name = _save_bytes(media_id, data, "mp4")
        db.update_media(media_id, status="done", file_name=name, model=model)
    except asyncio.CancelledError:
        db.update_media(media_id, status="failed", error="cancelled")
        raise
    except Exception as e:
        db.update_media(media_id, status="failed", error=str(e)[:1000])
    finally:
        _running_jobs.pop(media_id, None)


def start_video(prompt: str, provider: Optional[str] = None, aspect: str = "16:9", seconds: int = 8) -> Dict[str, Any]:
    prompt = (prompt or "").strip()
    if not prompt:
        raise MediaError("Prompt is empty.")
    cfg = get_config()
    provider = provider or cfg["video_provider"]
    if provider not in VIDEO_PROVIDERS:
        raise MediaError(f"Unknown video provider '{provider}'.")
    # Fail fast on a missing key instead of creating a job that can only fail
    _key(cfg, "gemini_api_key" if provider == "gemini_veo" else "openai_api_key",
         "Gemini" if provider == "gemini_veo" else "OpenAI")
    item = db.add_media("video", prompt, provider, status="running", meta={"aspect": aspect})
    _running_jobs[item["id"]] = asyncio.get_running_loop().create_task(
        _run_video_job(item["id"], provider, prompt, aspect, seconds))
    return item


def recover_interrupted_jobs():
    """Videos still marked running after a restart lost their job; mark them failed so the UI doesn't wait forever."""
    for item in db.list_media(kind="video", limit=500):
        if item["status"] == "running" and item["id"] not in _running_jobs:
            db.update_media(item["id"], status="failed", error="interrupted (the server restarted)")


def public_item(item: Dict[str, Any]) -> Dict[str, Any]:
    out = {k: item.get(k) for k in ("id", "kind", "prompt", "provider", "model", "status", "error", "created_at")}
    out["meta"] = item.get("meta") or {}
    out["url"] = f"/api/media/file/{item['id']}" if item.get("file_name") else None
    return out

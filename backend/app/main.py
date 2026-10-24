import os
import json
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request, UploadFile, File, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel

from backend.app.config import settings, BASE_DIR
from backend.app.storage.database import db
from backend.app.tools.registry import registry
from backend.app.llm.provider import UnifiedLLMClient, ModelConfig
from backend.app.agent.core import AgentOrchestrator
from backend.app.services.telegram_bridge import telegram_bridge

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Load persisted tool states & start Telegram Bridge if configured
    try:
        disabled = db.get_setting("disabled_tools") or []
        registry.load_persisted_state(disabled)
    except Exception as e:
        print(f"[ToolRegistry] Startup warning: {e}")
    try:
        await telegram_bridge.start()
    except Exception as e:
        print(f"[TelegramBridge] Startup warning: {e}")
    yield
    # Shutdown
    try:
        await telegram_bridge.stop()
    except Exception as e:
        print(f"[TelegramBridge] Shutdown warning: {e}")

app = FastAPI(title=settings.app_name, version=settings.version, lifespan=lifespan)

# Enable CORS for local Vite development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request Models
class ChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
    persona_id: Optional[str] = "assistant"
    model_config_override: Optional[ModelConfig] = None
    user_message_id: Optional[str] = None
    assistant_message_id: Optional[str] = None
    images: Optional[List[str]] = None
    mode: Optional[str] = "chat"
    project: Optional[str] = None
    code_execution_mode: Optional[str] = "auto"

class ProjectCreatePayload(BaseModel):
    name: str
    template: Optional[str] = "python"
    custom_path: Optional[str] = None

class ProjectSelectPayload(BaseModel):
    name: Optional[str] = None

class TerminalExecPayload(BaseModel):
    command: str
    project: Optional[str] = None

class SessionCreate(BaseModel):
    title: Optional[str] = "新對話"
    persona_id: Optional[str] = "assistant"

class ToolToggle(BaseModel):
    enabled: bool

class TelegramConfigPayload(BaseModel):
    token: Optional[str] = ""
    chat_id: Optional[str] = ""
    enabled: bool = False

class TelegramTestPayload(BaseModel):
    token: Optional[str] = None
    chat_id: Optional[str] = None

class WorkspaceFileSavePayload(BaseModel):
    path: str
    content: str

class SwarmRequest(BaseModel):
    topic: str
    personas: List[str] = ["assistant", "coder", "researcher"]
    rounds: Optional[int] = 1
    model_config_override: Optional[ModelConfig] = None

class PromptEnhanceRequest(BaseModel):
    prompt: str
    temperature: Optional[float] = 0.7
    persona_id: Optional[str] = "assistant"

# Health Check
@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.version,
        "workspace": str(settings.workspace_dir)
    }

# AI Prompt Enhancer Endpoint (3.5 Preview)
@app.post("/api/prompt/enhance")
async def enhance_prompt_endpoint(req: PromptEnhanceRequest):
    raw_prompt = req.prompt.strip()
    if not raw_prompt:
        raise HTTPException(status_code=400, detail="Prompt cannot be empty")

    temp = float(req.temperature if req.temperature is not None else 0.7)
    if temp <= 0.3:
        enhanced = (
            f"【🎯 精確嚴謹模式 (Precise & Rigorous)】請針對以下工程需求進行全方位架構拆解與可驗證實作：\n"
            f"1. 核心目標與邊界條件 (Scope & Strict Boundary Constraints)\n"
            f"2. 嚴密邏輯推論、演算法設計與極限邊界案例 (Edge Cases & Invariants)\n"
            f"3. 完整技術實作、型別安全定義與驗證測試步驟 (Types, Code & Tests)\n\n"
            f"原始需求指令：\n{raw_prompt}\n\n"
            f"請輸出具備高確定性、零假設、可直接部署驗證的工業級方案。"
        )
    elif temp >= 0.9:
        enhanced = (
            f"【🎨 發散創意模式 (Creative & Visionary)】請針對以下創意靈感進行跨界探索與前瞻性架構延伸：\n"
            f"1. 顛覆性概念設計與未來感視覺/互動體驗 (Avant-Garde Architecture & UX)\n"
            f"2. 多維度創新方案探索與彩蛋驚喜構思 (Novel Variations & Easter Eggs)\n"
            f"3. 具備視覺魅力、生動細膩且引人入勝的完整實作藍圖 (Vibrant & Expressive Implementation)\n\n"
            f"原始需求靈感：\n{raw_prompt}\n\n"
            f"請發揮最高想像力與聯想力，帶來超乎預期的驚艷技術與藝術交付！"
        )
    else:
        enhanced = (
            f"【⚖️ 標準平衡模式 (Balanced)】請針對以下需求提供高規格、結構化且具備深度實踐價值的解答：\n"
            f"1. 需求分析與最佳實踐架構設計\n"
            f"2. 模組化程式碼實作與關鍵註解說明\n"
            f"3. 潛在風險排查與效能優化建議\n\n"
            f"原始需求：\n{raw_prompt}\n\n"
            f"請輸出結構清晰、條理分明、兼顧理論深度與工程可維護性的高品質回覆。"
        )

    return {
        "success": True,
        "enhanced_prompt": enhanced,
        "original_prompt": raw_prompt,
        "temperature": temp
    }

# Active Model Config API
@app.get("/api/models/active")
async def get_active_model_config():
    saved = db.get_setting("active_model_config")
    if saved:
        if saved.get("max_tokens") == 4096:
            saved["max_tokens"] = 8192
            db.set_setting("active_model_config", saved)
        cfg = ModelConfig(**saved)
    else:
        cfg = ModelConfig(
            provider="ollama",
            base_url="http://localhost:11434",
            model="",
            temperature=0.7,
            max_tokens=8192
        )

    # Auto-probe local Ollama: sync actual installed models, never load fake models!
    if cfg.provider == "ollama":
        try:
            probe = await UnifiedLLMClient(cfg).test_connection()
            models = probe.get("models") or []
            if probe.get("success") and models:
                if not cfg.model or cfg.model not in models:
                    cfg.model = models[0]
                    db.set_setting("active_model_config", cfg.model_dump())
            elif probe.get("success") and not models:
                # Connected to Ollama, but no models installed!
                if cfg.model:
                    cfg.model = ""
                    db.set_setting("active_model_config", cfg.model_dump())
            elif not probe.get("success"):
                # Ollama is not connected; clear fake default if any
                if cfg.model in ["llama3:latest", "local-model"]:
                    cfg.model = ""
                    db.set_setting("active_model_config", cfg.model_dump())
        except Exception:
            pass

    return cfg.model_dump()

@app.post("/api/models/active")
async def save_active_model_config(config: ModelConfig):
    db.set_setting("active_model_config", config.model_dump())
    return {"status": "saved", "config": config.model_dump()}

# Model Testing & Discovery
@app.post("/api/models/test")
async def test_model_connection(config: ModelConfig):
    client = UnifiedLLMClient(config)
    result = await client.test_connection()
    return result

async def generate_ai_session_title(session_id: str, prompt_snippet: str, config: ModelConfig) -> str:
    """Generate a concise, insightful conversation title (4-8 Chinese characters) using AI."""
    import re
    try:
        title_config = config.model_copy(update={"max_tokens": 40, "temperature": 0.3})
        client = UnifiedLLMClient(title_config)
        messages = [
            {
                "role": "system",
                "content": (
                    "你是一個專業的對話主題命名助手。請針對使用者的提問或對話內容，提煉出一個極具代表性、精簡精準的對話標題。\n"
                    "【命名原則】：\n"
                    "1. 長度嚴格限制在 4 到 8 個繁體中文字以內。\n"
                    "2. 嚴禁輸出任何引號、前綴（如「標題：」）、標點符號或任何解釋說明。\n"
                    "3. 直接輸出純文字標題名稱。"
                )
            },
            {
                "role": "user",
                "content": f"使用者提問內容：\n{prompt_snippet[:200]}\n\n請輸出 4-8 字主題標題："
            }
        ]
        title_text = ""
        async for chunk in client.stream_chat(messages):
            if chunk.type == "token" and chunk.content:
                title_text += chunk.content
        clean_title = title_text.strip().replace('"', '').replace("'", '').replace("《", "").replace("》", "").replace("「", "").replace("」", "").replace("標題：", "").replace("標題:", "").strip()
        clean_title = re.sub(r'[，。！？\.,!?]+$', '', clean_title).strip()
        if clean_title:
            if len(clean_title) > 15:
                clean_title = clean_title[:15]
            db.update_session(session_id, title=clean_title)
            return clean_title
    except Exception as e:
        print(f"[AISessionTitle] Failed to generate title: {e}")
    clean_fallback = prompt_snippet.strip()[:10]
    if clean_fallback:
        db.update_session(session_id, title=clean_fallback)
        return clean_fallback
    return ""

# Chat Streaming Endpoint (SSE)
@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    # Determine session
    session_id = request.session_id
    needs_ai_title = False
    if not session_id:
        needs_ai_title = True
        title = "新對話"
        new_sess = db.create_session(title=title, persona_id=request.persona_id or "assistant")
        session_id = new_sess["id"]
    else:
        # Verify session exists
        sess = db.get_session(session_id)
        if not sess:
            needs_ai_title = True
            title = "新對話"
            db.create_session(title=title, persona_id=request.persona_id or "assistant", session_id=session_id)
        elif sess.get("title") in ("新對話", "開啟新對話", "New Session", "新会话") or not sess.get("title"):
            needs_ai_title = True

    # Determine Model Config
    if request.model_config_override:
        active_config = request.model_config_override
    else:
        saved = db.get_setting("active_model_config")
        if saved:
            if saved.get("max_tokens") == 4096:
                saved["max_tokens"] = 8192
            active_config = ModelConfig(**saved)
        else:
            active_config = ModelConfig(
                provider="ollama",
                base_url="http://localhost:11434",
                model="",
                max_tokens=8192
            )

    # Validate that an active model is configured
    if not active_config.model or not active_config.model.strip():
        # Check if local provider has any installed models
        try:
            probe = await UnifiedLLMClient(active_config).test_connection()
            models = probe.get("models") or []
            if probe.get("success") and models:
                active_config.model = models[0]
                db.set_setting("active_model_config", active_config.model_dump())
        except Exception:
            pass

    if not active_config.model or not active_config.model.strip():
        async def no_model_generator():
            yield {
                "event": "session_info",
                "data": json.dumps({"session_id": session_id}, ensure_ascii=False)
            }
            yield {
                "event": "error",
                "data": json.dumps({
                    "error": "❌ 尚未安裝或選取任何 AI 模型。若使用 Ollama，請先在終端機執行 'ollama pull <模型名稱>'（例如 ollama pull llama3 或 ollama pull qwen2.5:7b）下載模型，或至右上角「設定」配置端點或 API Key。"
                }, ensure_ascii=False)
            }
        return EventSourceResponse(no_model_generator())

    # Code Mode Context Window Expansion & Max Tokens Relaxation
    if request.mode == "code":
        cw = active_config.context_window or 16384
        mt = active_config.max_tokens or 8192
        active_config.context_window = max(cw, 32768)
        active_config.max_tokens = max(mt, 16384)

    orchestrator = AgentOrchestrator(
        config=active_config,
        persona_id=request.persona_id or "assistant",
        mode=request.mode or "chat",
        project=request.project,
        code_execution_mode=request.code_execution_mode or "auto"
    )

    async def event_generator():
        # First event sends session info
        yield {
            "event": "session_info",
            "data": json.dumps({"session_id": session_id}, ensure_ascii=False)
        }
        try:
            async for ev in orchestrator.run_stream(
                session_id=session_id,
                user_prompt=request.message,
                user_message_id=request.user_message_id,
                assistant_message_id=request.assistant_message_id,
                images=request.images
            ):
                ev_type = ev.get("type", "message")
                yield {
                    "event": ev_type,
                    "data": json.dumps(ev, ensure_ascii=False)
                }

            # Generate insightful AI title for new sessions
            if needs_ai_title:
                ai_title = await generate_ai_session_title(session_id, request.message, active_config)
                if ai_title:
                    yield {
                        "event": "session_title",
                        "data": json.dumps({"session_id": session_id, "title": ai_title}, ensure_ascii=False)
                    }
        except Exception as e:
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)}, ensure_ascii=False)
            }

    return EventSourceResponse(event_generator())

# Sessions Endpoints
@app.get("/api/sessions")
async def list_sessions():
    return db.list_sessions()

@app.post("/api/sessions")
async def create_session(data: SessionCreate):
    return db.create_session(title=data.title or "新對話", persona_id=data.persona_id or "assistant")

@app.get("/api/sessions/search")
async def search_sessions_endpoint(q: str = ""):
    if not q.strip():
        return db.list_sessions()
    return db.search_sessions(q.strip())

@app.get("/api/sessions/{session_id}")
async def get_session_detail(session_id: str):
    sess = db.get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    messages = db.get_messages(session_id)
    return {"session": sess, "messages": messages}

@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: str):
    db.delete_session(session_id)
    return {"status": "deleted", "id": session_id}

# Tools Endpoints
@app.get("/api/tools")
async def list_tools():
    disabled = db.get_setting("disabled_tools") or []
    registry.load_persisted_state(disabled)
    return registry.get_raw_definitions()

@app.post("/api/tools/{name}/toggle")
async def toggle_tool(name: str, payload: ToolToggle):
    registry.set_tool_enabled(name, payload.enabled)
    disabled = [k for k, v in registry._definitions.items() if not v.enabled]
    db.set_setting("disabled_tools", disabled)
    return {"status": "updated", "success": True, "name": name, "enabled": payload.enabled}

@app.post("/api/tools/batch/toggle-all")
async def batch_toggle_tools(payload: ToolToggle):
    for name in registry._definitions.keys():
        registry.set_tool_enabled(name, payload.enabled)
    disabled = [k for k, v in registry._definitions.items() if not v.enabled]
    db.set_setting("disabled_tools", disabled)
    return {"status": "updated", "success": True, "all_enabled": payload.enabled}

# Personas Endpoints
@app.get("/api/personas")
async def list_personas():
    return db.list_personas()

@app.post("/api/personas")
async def save_persona(persona: Dict[str, Any]):
    db.save_persona(persona)
    return {"status": "saved", "persona": persona}

@app.delete("/api/personas/{persona_id}")
async def delete_persona(persona_id: str):
    try:
        success = db.delete_persona(persona_id)
        if not success:
            raise HTTPException(status_code=404, detail="找不到該角色")
        return {"status": "deleted", "id": persona_id, "success": True}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# File Upload Endpoint
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        upload_dir = settings.workspace_dir / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        # Sanitize filename
        safe_name = Path(file.filename or "uploaded_file").name
        target_path = upload_dir / safe_name
        content = await file.read()
        target_path.write_bytes(content)
        
        rel_path = f"uploads/{safe_name}"
        return {
            "success": True,
            "filename": safe_name,
            "path": rel_path,
            "size": len(content),
            "message": f"檔案已成功上傳至工作區 '{rel_path}'，Agent 可直接讀取與分析。"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

# Session Export Endpoint (Markdown or JSON)
@app.get("/api/sessions/{session_id}/export")
async def export_session(session_id: str, format: str = "markdown"):
    sess = db.get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    messages = db.get_messages(session_id)

    if format == "json":
        return {"session": sess, "messages": messages}

    # Generate Markdown export
    lines = [
        f"# {sess['title']}",
        f"- **建立時間**: {sess['created_at']}",
        f"- **智能體人格**: {sess.get('persona_id', 'assistant')}",
        "",
        "---",
        ""
    ]
    for m in messages:
        role_label = "👤 使用者" if m["role"] == "user" else "💧 Aether AI Studio 3.0 (AetherAgent)"
        lines.append(f"### {role_label}")
        if m.get("thought"):
            lines.append(f"> 💭 **思維鏈過程**:\n> {m['thought'].replace(chr(10), chr(10) + '> ')}")
            lines.append("")
        if m.get("tool_calls"):
            lines.append("**🛠️ 工具執行記錄**:")
            for tc in m["tool_calls"]:
                lines.append(f"- `{tc.get('name')}`: {tc.get('output', '')[:100]}...")
            lines.append("")
        lines.append(m["content"])
        lines.append("")
        lines.append("---")
        lines.append("")

    md_content = "\n".join(lines)
    return Response(
        content=md_content,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="chat_{session_id[:8]}.md"'}
    )

# Session Rename / Update
@app.put("/api/sessions/{session_id}")
async def update_session(session_id: str, payload: Dict[str, Any]):
    title = payload.get("title")
    persona_id = payload.get("persona_id")
    db.update_session(session_id, title=title, persona_id=persona_id)
    return {"status": "updated", "id": session_id}

# On-Demand AI Session Title Generation
@app.post("/api/sessions/{session_id}/ai_title")
async def generate_session_ai_title_endpoint(session_id: str):
    sess = db.get_session(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    messages = db.get_messages(session_id)
    if not messages:
        raise HTTPException(status_code=400, detail="No messages in session")
    user_msgs = [m["content"] for m in messages if m["role"] == "user"]
    context = "\n".join(user_msgs[:2]) if user_msgs else (messages[0].get("content") or "")
    saved = db.get_setting("active_model_config")
    active_config = ModelConfig(**saved) if saved else ModelConfig(provider="ollama", base_url="http://localhost:11434", model="llama3:latest")
    new_title = await generate_ai_session_title(session_id, context, active_config)
    if not new_title:
        new_title = context[:12]
        db.update_session(session_id, title=new_title)
    return {"status": "success", "session_id": session_id, "title": new_title}

# Memories Endpoints
@app.get("/api/memories")
async def get_memories():
    return db.list_memories()

@app.delete("/api/memories/{mem_id}")
async def delete_memory(mem_id: str):
    db.delete_memory(mem_id)
    return {"status": "deleted", "id": mem_id}

# Telegram Bridge Endpoints
@app.get("/api/telegram/status")
async def get_telegram_status():
    return telegram_bridge.get_status()

@app.post("/api/telegram/config")
async def save_telegram_config(config: TelegramConfigPayload):
    existing = db.get_setting("telegram_config") or {}
    data = config.model_dump()
    if not data.get("token") and existing.get("token"):
        data["token"] = existing["token"]
    db.set_setting("telegram_config", data)
    if data.get("enabled"):
        await telegram_bridge.restart()
    else:
        await telegram_bridge.stop()
    return {"status": "saved", "bridge": telegram_bridge.get_status()}

@app.post("/api/telegram/test")
async def test_telegram_endpoint(payload: TelegramTestPayload):
    existing = db.get_setting("telegram_config") or {}
    token = payload.token or existing.get("token", "")
    chat_id = payload.chat_id if payload.chat_id is not None else existing.get("chat_id")
    return await telegram_bridge.test_connection(token, chat_id)

# ================= Full-Text Session Search & Bookmarks =================

@app.post("/api/messages/{message_id}/bookmark")
async def toggle_message_bookmark_endpoint(message_id: str):
    is_bookmarked = db.toggle_message_bookmark(message_id)
    return {"id": message_id, "is_bookmarked": is_bookmarked}

@app.get("/api/bookmarks")
async def get_bookmarks_endpoint():
    return db.get_bookmarked_messages()

@app.delete("/api/messages/{message_id}")
async def delete_message_endpoint(message_id: str):
    db.delete_message(message_id)
    return {"status": "deleted", "id": message_id}

# ================= Workspace File Explorer & Artifacts =================

@app.get("/api/workspace/files")
async def list_workspace_files(subpath: str = ""):
    base = settings.workspace_dir.resolve()
    target_dir = (base / subpath).resolve() if subpath else base
    if not target_dir.is_relative_to(base):
        raise HTTPException(status_code=403, detail="Access denied: Path escapes workspace")
    if not target_dir.exists():
        return []
    
    file_list = []
    try:
        for root, dirs, files in os.walk(str(target_dir)):
            dirs[:] = [d for d in dirs if not d.startswith(".") and d != "__pycache__" and d != "node_modules"]
            for d in dirs:
                full_d = Path(root) / d
                rel_d = full_d.relative_to(base).as_posix()
                file_list.append({
                    "name": d,
                    "path": rel_d,
                    "size": 0,
                    "is_dir": True,
                    "mtime": int(full_d.stat().st_mtime),
                    "extension": ""
                })
            for f in files:
                if f.startswith("."):
                    continue
                full_f = Path(root) / f
                rel_f = full_f.relative_to(base).as_posix()
                stat = full_f.stat()
                file_list.append({
                    "name": f,
                    "path": rel_f,
                    "size": stat.st_size,
                    "is_dir": False,
                    "mtime": int(stat.st_mtime),
                    "extension": full_f.suffix.lower().lstrip(".")
                })
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    file_list.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
    return file_list

@app.get("/api/workspace/file")
async def get_workspace_file(path: str, raw: bool = False):
    base = settings.workspace_dir.resolve()
    target = (base / path).resolve()
    if not target.is_relative_to(base):
        raise HTTPException(status_code=403, detail="Access denied: Path escapes workspace")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail=f"File '{path}' not found")
    
    ext = target.suffix.lower()
    img_exts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"]
    if ext in img_exts or raw:
        return FileResponse(str(target))
    
    try:
        content = target.read_text(encoding="utf-8", errors="replace")
        stat = target.stat()
        return {
            "name": target.name,
            "path": target.relative_to(base).as_posix(),
            "size": stat.st_size,
            "mtime": int(stat.st_mtime),
            "extension": ext.lstrip("."),
            "content": content
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error reading file: {str(e)}")

@app.post("/api/workspace/file")
async def save_workspace_file(payload: WorkspaceFileSavePayload):
    base = settings.workspace_dir.resolve()
    target = (base / payload.path).resolve()
    if not target.is_relative_to(base):
        raise HTTPException(status_code=403, detail="Access denied: Path escapes workspace")
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(payload.content, encoding="utf-8")
        return {"status": "saved", "path": target.relative_to(base).as_posix(), "size": len(payload.content)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")

@app.delete("/api/workspace/file")
async def delete_workspace_file(path: str):
    base = settings.workspace_dir.resolve()
    target = (base / path).resolve()
    if not target.is_relative_to(base):
        raise HTTPException(status_code=403, detail="Access denied: Path escapes workspace")
    if not target.exists():
        raise HTTPException(status_code=404, detail="Path not found")
    try:
        if target.is_file():
            target.unlink()
        elif target.is_dir():
            import shutil
            shutil.rmtree(target)
        return {"status": "deleted", "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting: {str(e)}")

# ================= Multi-Agent Swarm Collaborative Debate =================

@app.post("/api/chat/swarm")
async def swarm_stream(request: SwarmRequest):
    if request.model_config_override:
        active_config = request.model_config_override
    else:
        saved = db.get_setting("active_model_config")
        if saved:
            active_config = ModelConfig(**saved)
        else:
            active_config = ModelConfig(
                provider="ollama",
                base_url="http://localhost:11434",
                model="llama3:latest"
            )

    client = UnifiedLLMClient(active_config)
    selected_personas = []
    for pid in request.personas:
        p = db.get_persona(pid)
        if p:
            selected_personas.append(p)
    if not selected_personas:
        p = db.get_persona("assistant")
        if p:
            selected_personas.append(p)

    async def swarm_generator():
        yield {
            "event": "swarm_start",
            "data": json.dumps({
                "topic": request.topic,
                "personas": [{"id": p["id"], "name": p["name"], "icon": p.get("icon", "Bot")} for p in selected_personas]
            })
        }

        debate_transcript = []
        rounds = max(1, min(request.rounds or 1, 3))

        # Create lightweight client configs for debate turns and summary to ensure swift responsiveness
        turn_config = active_config.model_copy(update={"max_tokens": 384, "temperature": min(active_config.temperature, 0.7)})
        turn_client = UnifiedLLMClient(turn_config)

        summary_config = active_config.model_copy(update={"max_tokens": 768, "temperature": 0.5})
        summary_client = UnifiedLLMClient(summary_config)

        for r in range(1, rounds + 1):
            for persona in selected_personas:
                pid = persona["id"]
                pname = persona["name"]
                picon = persona.get("icon", "Bot")
                psystem = persona.get("system_prompt", "")

                yield {
                    "event": "swarm_turn_start",
                    "data": json.dumps({
                        "round": r,
                        "persona_id": pid,
                        "persona_name": pname,
                        "persona_icon": picon
                    })
                }

                context_str = "\n\n".join([f"[{item['persona_name']} (輪次 {item['round']})]:\n{item['content']}" for item in debate_transcript[-4:]])
                prompt = (
                    f"【多智能體協同架構會議 / 圓桌論壇】\n"
                    f"會議核心議題: {request.topic}\n"
                    f"當前輪次: 第 {r} 輪 (共 {rounds} 輪)\n\n"
                )
                if context_str:
                    prompt += f"先前發言摘要與交鋒:\n{context_str}\n\n請針對同僚發言提出關鍵技術剖析、架構質疑或實施方案。"
                else:
                    prompt += "請對此議題提出第一輪的關鍵觀點、架構分析與解決路線。"

                messages = [
                    {"role": "system", "content": f"{psystem}\n【圓桌發言限制】請以高信息密度的繁體中文切入核心要點，不贅述背景與客套寒暄，發言篇幅控制在 150～200 字以內。"},
                    {"role": "user", "content": prompt}
                ]

                turn_content = ""
                async for chunk in turn_client.stream_chat(messages):
                    if chunk.type == "token" and chunk.content:
                        turn_content += chunk.content
                        yield {
                            "event": "token",
                            "data": json.dumps({"content": chunk.content})
                        }
                    elif chunk.type == "error":
                        yield {
                            "event": "error",
                            "data": json.dumps({"error": chunk.content})
                        }

                debate_transcript.append({
                    "round": r,
                    "persona_id": pid,
                    "persona_name": pname,
                    "content": turn_content
                })

                yield {
                    "event": "swarm_turn_done",
                    "data": json.dumps({
                        "round": r,
                        "persona_id": pid,
                        "persona_name": pname,
                        "content": turn_content
                    })
                }

        yield {
            "event": "swarm_summary_start",
            "data": json.dumps({"title": "Aether 智庫共識結論與行動路徑圖"})
        }

        all_transcript = "\n\n".join([f"### {t['persona_name']} (輪次 {t['round']}):\n{t['content']}" for t in debate_transcript])
        summary_messages = [
            {
                "role": "system",
                "content": "你是 Aether 智庫主席。請根據會議中各位專家的深度交鋒與技術觀點，進行高度結構化的總結，產出核心技術共識、關鍵爭議點與具體可執行的工程落地方案（總篇幅控制在 250 字內）。"
            },
            {
                "role": "user",
                "content": f"議題: {request.topic}\n\n各位專家發言記錄:\n{all_transcript}\n\n請輸出結構化共識報告與實施路徑："
            }
        ]

        summary_content = ""
        async for chunk in summary_client.stream_chat(summary_messages):
            if chunk.type == "token" and chunk.content:
                summary_content += chunk.content
                yield {
                    "event": "token",
                    "data": json.dumps({"content": chunk.content})
                }

        yield {
            "event": "swarm_done",
            "data": json.dumps({"status": "completed"})
        }

    return EventSourceResponse(swarm_generator())



# Projects & Code Mode Endpoints
@app.get('/api/projects/browse-folder')
@app.post('/api/projects/browse-folder')
async def browse_folder():
    """Opens a native graphical folder picker dialog on the host system."""
    import asyncio
    def _pick():
        # First try Tkinter
        try:
            import tkinter as tk
            from tkinter import filedialog
            root = tk.Tk()
            root.withdraw()
            root.attributes('-topmost', True)
            root.focus_force()
            selected = filedialog.askdirectory(title="選擇專案資料夾 (Select Project Directory)")
            root.destroy()
            if selected:
                p = Path(selected).resolve()
                return {"status": "ok", "path": str(p), "name": p.name}
            return {"status": "canceled", "path": None, "name": None}
        except Exception as e:
            print(f"[BrowseFolder] Tkinter failed: {e}")

        # Fallback to PowerShell FolderBrowserDialog on Windows
        if os.name == "nt":
            import subprocess
            ps_script = """
            Add-Type -AssemblyName System.Windows.Forms
            $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
            $dialog.Description = '請選擇專案資料夾 (Aether Code Project)'
            $dialog.ShowNewFolderButton = $true
            $form = New-Object System.Windows.Forms.Form
            $form.TopMost = $true
            $res = $dialog.ShowDialog($form)
            if ($res -eq [System.Windows.Forms.DialogResult]::OK) {
                Write-Output $dialog.SelectedPath
            }
            """
            try:
                out = subprocess.check_output(
                    ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_script],
                    text=True,
                    timeout=60
                ).strip()
                if out:
                    p = Path(out).resolve()
                    return {"status": "ok", "path": str(p), "name": p.name}
                return {"status": "canceled", "path": None, "name": None}
            except Exception as e:
                print(f"[BrowseFolder] PowerShell failed: {e}")
        return {"status": "error", "error": "無法開啟系統檔案選取視窗", "path": None, "name": None}

    return await asyncio.to_thread(_pick)

@app.get('/api/projects')
async def list_projects():
    base = settings.base_workspace_dir.resolve()
    projects_dir = base / 'projects'
    projects_dir.mkdir(parents=True, exist_ok=True)
    project_list = []
    seen_names = set()
    
    # 1. Prioritize custom projects registered in projects_metadata
    projects_meta = db.get_setting('projects_metadata') or {}
    for name, meta in projects_meta.items():
        p_path = Path(meta.get('path', '')).resolve()
        if p_path.exists() and p_path.is_dir():
            seen_names.add(name)
            try:
                f_count = sum(1 for _ in p_path.rglob('*') if _.is_file() and not _.name.startswith('.') and 'node_modules' not in _.parts and '.git' not in _.parts)
                stat = p_path.stat()
                mtime = int(stat.st_mtime)
            except Exception:
                f_count = 0
                mtime = 0
            project_list.append({
                'name': name,
                'path': str(p_path),
                'full_path': str(p_path),
                'custom': meta.get('custom', True),
                'file_count': f_count,
                'updated_at': mtime
            })

    # 2. Add projects under default workspace/projects
    try:
        for entry in os.scandir(str(projects_dir)):
            if entry.is_dir() and not entry.name.startswith('.') and entry.name not in seen_names:
                seen_names.add(entry.name)
                p_path = Path(entry.path).resolve()
                f_count = sum(1 for _ in p_path.rglob('*') if _.is_file() and not _.name.startswith('.') and 'node_modules' not in _.parts and '.git' not in _.parts)
                stat = p_path.stat()
                project_list.append({
                    'name': entry.name,
                    'path': f'projects/{entry.name}',
                    'full_path': str(p_path),
                    'custom': False,
                    'file_count': f_count,
                    'updated_at': int(stat.st_mtime)
                })
    except Exception as e:
        print(f'[Projects] Scan warning: {e}')
    project_list.sort(key=lambda x: x['updated_at'], reverse=True)
    active_proj = db.get_setting('active_project')
    if active_proj and not any(p['name'] == active_proj for p in project_list):
        active_proj = None
    return {
        'projects': project_list,
        'active_project': active_proj,
        'workspace_path': str(settings.workspace_dir.resolve())
    }

@app.post('/api/projects')
async def create_project(payload: ProjectCreatePayload):
    import re
    clean_name = re.sub(r'[^a-zA-Z0-9_\-]', '', (payload.name or '').strip())
    base = settings.base_workspace_dir.resolve()
    
    is_custom = bool(payload.custom_path and payload.custom_path.strip())
    if is_custom:
        target = Path(payload.custom_path.strip()).resolve()
        if not clean_name:
            clean_name = re.sub(r'[^a-zA-Z0-9_\-]', '', target.name) or f"project_{int(time.time())}"
    else:
        if not clean_name:
            raise HTTPException(status_code=400, detail='無效的專案名稱。請使用英文字母、數字或底線/連字號。')
        target = (base / 'projects' / clean_name).resolve()
        
    target.mkdir(parents=True, exist_ok=True)
    tpl = (payload.template or 'python').lower()
    
    # Check if target already has user files (don't overwrite existing code)
    has_existing_files = any(f for f in target.iterdir() if not f.name.startswith('.'))
    if not has_existing_files and not (target / "README.md").exists():
        if tpl == "python":
            (target / "main.py").write_text("# -*- coding: utf-8 -*-\n\"\"\"\nPython Project Initialized by Aether Code Agent\n\"\"\"\n\ndef main():\n    print(\"Hello from Aether Code Agent 🚀\")\n\nif __name__ == \"__main__\":\n    main()\n", encoding="utf-8")
            (target / "requirements.txt").write_text("# Project Dependencies\n", encoding="utf-8")
            (target / "README.md").write_text(f"# {clean_name}\n\n自主工程專案已就緒。由 Aether Code Agent 支援。\n", encoding="utf-8")
        elif tpl in ("web", "frontend", "html"):
            (target / "index.html").write_text(f"<!DOCTYPE html>\n<html lang=\"zh-TW\">\n<head>\n  <meta charset=\"UTF-8\">\n  <title>{clean_name}</title>\n  <link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n  <div id=\"app\">\n    <h1>🚀 {clean_name} Web Project</h1>\n  </div>\n  <script src=\"app.js\"></script>\n</body>\n</html>\n", encoding="utf-8")
            (target / "style.css").write_text("body { font-family: system-ui, sans-serif; background: #0b101e; color: #e2e8f0; margin: 2rem; }\n", encoding="utf-8")
            (target / "app.js").write_text("console.log(\"🚀 Project initialized by Aether Code Agent\");\n", encoding="utf-8")
            (target / "README.md").write_text(f"# {clean_name}\n\n前端網頁工程專案。\n", encoding="utf-8")
        elif tpl in ("node", "javascript", "js"):
            (target / "package.json").write_text("{\n  \"name\": \"" + clean_name.lower() + "\",\n  \"version\": \"1.0.0\",\n  \"main\": \"index.js\",\n  \"scripts\": {\n    \"start\": \"node index.js\"\n  }\n}\n", encoding="utf-8")
            (target / "index.js").write_text("console.log(\"Hello from Aether Code Agent in Node.js 🚀\");\n", encoding="utf-8")
            (target / "README.md").write_text(f"# {clean_name}\n\nNode.js 工程專案。\n", encoding="utf-8")
        else:
            (target / "README.md").write_text(f"# {clean_name}\n\n專案工作區已建立。\n", encoding="utf-8")

    db.set_setting('active_project', clean_name)
    projects_meta = db.get_setting('projects_metadata') or {}
    projects_meta[clean_name] = {'path': str(target), 'custom': is_custom}
    db.set_setting('projects_metadata', projects_meta)
    return {
        'status': 'created',
        'project': clean_name,
        'path': str(target),
        'template': tpl
    }

@app.post('/api/projects/select')
async def select_project(payload: ProjectSelectPayload):
    name = (payload.name or '').strip()
    if name:
        base = settings.base_workspace_dir.resolve()
        projects_meta = db.get_setting('projects_metadata') or {}
        if name in projects_meta:
            target = Path(projects_meta[name].get('path', '')).resolve()
        else:
            target = (base / 'projects' / name).resolve()
        if not target.exists() or not target.is_dir():
            raise HTTPException(status_code=404, detail=f"專案 '{name}' 不存在")
        db.set_setting('active_project', name)
    else:
        db.set_setting('active_project', None)
    return {'status': 'selected', 'active_project': name or None}

@app.delete('/api/projects/{name}')
async def delete_project(name: str):
    clean_name = name.strip()
    projects_meta = db.get_setting('projects_metadata') or {}
    if clean_name in projects_meta:
        del projects_meta[clean_name]
        db.set_setting('projects_metadata', projects_meta)
    active = db.get_setting('active_project')
    if active == clean_name:
        db.set_setting('active_project', None)
    return {'status': 'deleted', 'name': clean_name}

@app.get('/api/projects/active')
async def get_active_project():
    active = db.get_setting('active_project')
    base = settings.base_workspace_dir.resolve()
    projects_meta = db.get_setting('projects_metadata') or {}
    if active and active in projects_meta:
        target_path = projects_meta[active].get('path', str(base))
    else:
        target_path = str(base / 'projects' / active) if active else str(base)
    return {
        'active_project': active,
        'path': target_path
    }

@app.post('/api/terminal/exec')
async def execute_terminal_command(payload: TerminalExecPayload):
    import subprocess
    import time
    cmd = (payload.command or '').strip()
    if not cmd:
        return {'stdout': '', 'stderr': 'No command provided', 'exit_code': 1, 'duration_ms': 0}
    dangerous = ['rm -rf /', 'mkfs', ':(){ :|:& };:', 'dd if=/dev/']
    for d in dangerous:
        if d in cmd:
            return {'stdout': '', 'stderr': f'Command rejected: contains dangerous pattern \'{d}\'', 'exit_code': 126, 'duration_ms': 0}
    base = settings.workspace_dir.resolve()
    project_name = payload.project or db.get_setting('active_project')
    projects_meta = db.get_setting('projects_metadata') or {}
    if project_name:
        if project_name in projects_meta:
            cand = Path(projects_meta[project_name].get('path', '')).resolve()
            target_cwd = cand if cand.exists() and cand.is_dir() else base
        else:
            cand = base / 'projects' / project_name
            target_cwd = cand if cand.exists() and cand.is_dir() else base
    else:
        target_cwd = base
    start_time = time.time()
    env = os.environ.copy()
    env['PYTHONIOENCODING'] = 'utf-8'
    env['PYTHONUTF8'] = '1'
    try:
        res = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            timeout=30,
            cwd=str(target_cwd),
            env=env
        )
        duration_ms = round((time.time() - start_time) * 1000, 1)
        def _decode(b):
            if not b:
                return ''
            for enc in ('utf-8', 'cp950', 'gbk', 'latin1'):
                try:
                    return b.decode(enc)
                except Exception:
                    continue
            return b.decode('utf-8', errors='replace')
        out = _decode(res.stdout).strip()
        err = _decode(res.stderr).strip()
        return {
            'stdout': out,
            'stderr': err,
            'exit_code': res.returncode,
            'duration_ms': duration_ms,
            'cwd': str(target_cwd),
            'project': project_name
        }
    except subprocess.TimeoutExpired:
        duration_ms = round((time.time() - start_time) * 1000, 1)
        return {
            'stdout': '',
            'stderr': 'Command timed out after 30 seconds.',
            'exit_code': 124,
            'duration_ms': duration_ms,
            'cwd': str(target_cwd),
            'project': project_name
        }
    except Exception as e:
        duration_ms = round((time.time() - start_time) * 1000, 1)
        return {
            'stdout': '',
            'stderr': f'Execution failed: {str(e)}',
            'exit_code': 1,
            'duration_ms': duration_ms,
            'cwd': str(target_cwd),
            'project': project_name
        }

# Serve Frontend static assets if built
FRONTEND_DIST = (BASE_DIR.parent / "frontend" / "dist").resolve()
if (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    if not FRONTEND_DIST.exists():
        raise HTTPException(status_code=404, detail="Frontend dist not built yet. Run 'npm run build' in frontend/.")
    if full_path:
        file_path = (FRONTEND_DIST / full_path).resolve()
        if file_path.is_relative_to(FRONTEND_DIST) and file_path.exists() and file_path.is_file():
            if file_path.suffix.lower() == ".html":
                return FileResponse(
                    str(file_path),
                    headers={
                        "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
                        "Pragma": "no-cache",
                        "Expires": "0"
                    }
                )
            return FileResponse(str(file_path))
    index_file = FRONTEND_DIST / "index.html"
    if index_file.exists():
        return FileResponse(
            str(index_file),
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        )
    raise HTTPException(status_code=404, detail="index.html not found in frontend/dist.")



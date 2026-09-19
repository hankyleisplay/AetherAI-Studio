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
    # Startup: Start Telegram Bridge if configured
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
    token: str
    chat_id: Optional[str] = None

# Health Check
@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.version,
        "workspace": str(settings.workspace_dir)
    }

# Active Model Config API
@app.get("/api/models/active")
async def get_active_model_config():
    saved = db.get_setting("active_model_config")
    if saved:
        return saved
    # Default configuration
    default_config = ModelConfig(
        provider="ollama",
        base_url="http://localhost:11434",
        model="llama3:latest",
        temperature=0.7,
        max_tokens=4096
    )
    return default_config.model_dump()

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

# Chat Streaming Endpoint (SSE)
@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    # Determine session
    session_id = request.session_id
    if not session_id:
        # Generate initial title from first 20 chars of message
        title = request.message[:20] + ("..." if len(request.message) > 20 else "")
        new_sess = db.create_session(title=title, persona_id=request.persona_id or "assistant")
        session_id = new_sess["id"]
    else:
        # Verify session exists
        sess = db.get_session(session_id)
        if not sess:
            title = request.message[:20] + ("..." if len(request.message) > 20 else "")
            db.create_session(title=title, persona_id=request.persona_id or "assistant")

    # Determine Model Config
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

    orchestrator = AgentOrchestrator(
        config=active_config,
        persona_id=request.persona_id or "assistant"
    )

    async def event_generator():
        # First event sends session info
        yield {
            "event": "session_info",
            "data": json.dumps({"session_id": session_id})
        }
        try:
            async for ev in orchestrator.run_stream(session_id, request.message):
                ev_type = ev.get("type", "message")
                yield {
                    "event": ev_type,
                    "data": json.dumps(ev)
                }
        except Exception as e:
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)})
            }

    return EventSourceResponse(event_generator())

# Sessions Endpoints
@app.get("/api/sessions")
async def list_sessions():
    return db.list_sessions()

@app.post("/api/sessions")
async def create_session(data: SessionCreate):
    return db.create_session(title=data.title or "新對話", persona_id=data.persona_id or "assistant")

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
    return registry.get_raw_definitions()

@app.post("/api/tools/{name}/toggle")
async def toggle_tool(name: str, payload: ToolToggle):
    registry.set_tool_enabled(name, payload.enabled)
# Personas Endpoints
@app.get("/api/personas")
async def list_personas():
    return db.list_personas()

@app.post("/api/personas")
async def save_persona(persona: Dict[str, Any]):
    db.save_persona(persona)
    return {"status": "saved", "persona": persona}

# File Upload Endpoint
@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        upload_dir = settings.workspace_dir / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        # Sanitize filename
        safe_name = Path(file.filename).name
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
        role_label = "👤 使用者" if m["role"] == "user" else "💧 AetherAI Studio 2.0 (AetherAgent)"
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
    data = config.model_dump()
    db.set_setting("telegram_config", data)
    if data.get("enabled"):
        await telegram_bridge.restart()
    else:
        await telegram_bridge.stop()
    return {"status": "saved", "bridge": telegram_bridge.get_status()}

@app.post("/api/telegram/test")
async def test_telegram_endpoint(payload: TelegramTestPayload):
    return await telegram_bridge.test_connection(payload.token, payload.chat_id)


# Serve Frontend static assets if built
FRONTEND_DIST = BASE_DIR.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = FRONTEND_DIST / full_path
        if file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIST / "index.html"))

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

class WorkspaceFileSavePayload(BaseModel):
    path: str
    content: str

class SwarmRequest(BaseModel):
    topic: str
    personas: List[str] = ["assistant", "coder", "researcher"]
    rounds: Optional[int] = 1
    model_config_override: Optional[ModelConfig] = None

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

# ================= Full-Text Session Search & Bookmarks =================

@app.post("/api/messages/{message_id}/bookmark")
async def toggle_message_bookmark_endpoint(message_id: str):
    is_bookmarked = db.toggle_message_bookmark(message_id)
    return {"id": message_id, "is_bookmarked": is_bookmarked}

@app.get("/api/bookmarks")
async def get_bookmarks_endpoint():
    return db.get_bookmarked_messages()

# ================= Workspace File Explorer & Artifacts =================

@app.get("/api/workspace/files")
async def list_workspace_files(subpath: str = ""):
    base = settings.workspace_dir.resolve()
    target_dir = (base / subpath).resolve() if subpath else base
    if not str(target_dir).startswith(str(base)):
        raise HTTPException(status_code=403, detail="Access denied: Path escapes workspace")
    if not target_dir.exists():
        return []
    
    file_list = []
    try:
        for root, dirs, files in os.walk(str(target_dir)):
            dirs[:] = [d for d in dirs if not d.startswith(".") and d != "__pycache__" and d != "node_modules"]
            for d in dirs:
                full_d = Path(root) / d
                rel_d = str(full_d.relative_to(base))
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
                rel_f = str(full_f.relative_to(base))
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
    if not str(target).startswith(str(base)):
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
            "path": path,
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
    if not str(target).startswith(str(base)):
        raise HTTPException(status_code=403, detail="Access denied: Path escapes workspace")
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(payload.content, encoding="utf-8")
        return {"status": "saved", "path": payload.path, "size": len(payload.content)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")

@app.delete("/api/workspace/file")
async def delete_workspace_file(path: str):
    base = settings.workspace_dir.resolve()
    target = (base / path).resolve()
    if not str(target).startswith(str(base)):
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

                context_str = "\n\n".join([f"[{item['persona_name']} (輪次 {item['round']})]:\n{item['content']}" for item in debate_transcript[-6:]])
                prompt = (
                    f"【多智能體協同架構會議 / 圓桌論壇】\n"
                    f"會議核心議題: {request.topic}\n"
                    f"當前輪次: 第 {r} 輪 (共 {rounds} 輪)\n\n"
                )
                if context_str:
                    prompt += f"先前發言摘要與交鋒:\n{context_str}\n\n請根據你的專業定位，針對議題及上述同僚發言提出深度剖析、技術質疑或關鍵解決方案。"
                else:
                    prompt += "請根據你的專業定位，對此議題提出第一輪的關鍵觀點、架構分析與解決路線。"

                messages = [
                    {"role": "system", "content": f"{psystem}\n請保持極度專業，精闢闡述，不要冗長客套，直切工程核心要害。"},
                    {"role": "user", "content": prompt}
                ]

                turn_content = ""
                async for chunk in client.stream_chat(messages):
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
                "content": "你是 Aether 智庫主席。請根據會議中各位專家的深度交鋒與技術觀點，進行高度結構化的總結，產出：\n1. 核心技術共識\n2. 關鍵爭議點與取捨\n3. 具體可執行的工程落地方案與建議技術架構。"
            },
            {
                "role": "user",
                "content": f"議題: {request.topic}\n\n各位專家發言記錄:\n{all_transcript}\n\n請輸出結構化共識報告與實施路徑："
            }
        ]

        summary_content = ""
        async for chunk in client.stream_chat(summary_messages):
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

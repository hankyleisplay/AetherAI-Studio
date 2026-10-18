import sqlite3
import json
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional
from backend.app.config import settings

class Database:
    def __init__(self, db_path: Optional[str] = None):
        self.db_path = str(db_path or settings.db_path)
        self.init_db()

    def get_connection(self):
        conn = sqlite3.connect(self.db_path, timeout=15.0)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self):
        with self.get_connection() as conn:
            cursor = conn.cursor()
            # Sessions table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS sessions (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    persona_id TEXT DEFAULT 'assistant',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            # Messages table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    thought TEXT DEFAULT '',
                    tool_calls TEXT DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
                )
            """)
            # Personas table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS personas (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL,
                    icon TEXT DEFAULT 'bot',
                    system_prompt TEXT NOT NULL,
                    enabled_tools TEXT DEFAULT '[]'
                )
            """)
            # Global Settings table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
            """)
            # Persistent Long-term Memories table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS memories (
                    id TEXT PRIMARY KEY,
                    key TEXT NOT NULL,
                    content TEXT NOT NULL,
                    tags TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)

            # Auto-migrate: check if is_bookmarked and images column exist in messages
            cursor.execute("PRAGMA table_info(messages)")
            columns = [col[1] for col in cursor.fetchall()]
            if "is_bookmarked" not in columns:
                cursor.execute("ALTER TABLE messages ADD COLUMN is_bookmarked INTEGER DEFAULT 0")
            if "images" not in columns:
                cursor.execute("ALTER TABLE messages ADD COLUMN images TEXT DEFAULT '[]'")

            conn.commit()

        # Seed or upgrade default personas
        self._seed_default_personas()

    def _seed_default_personas(self):
        defaults = [
            {
                "id": "assistant",
                "name": "Aether 核心架構系統",
                "description": "全功能主控自主決策核心，精通複雜系統規劃與自主工具鏈調度",
                "icon": "Sparkles",
                "system_prompt": "你是 Aether AI Studio 3.0 (AetherAgent) 核心自主代理系統。我是由 hankyledevteam 開發的，主要是 Hanson Lee 開發打造，可以去 GitHub (https://github.com/hankyleisplay) 和 npm (https://www.npmjs.com/~hankyleisplay 或 https://github.com/hankyleisplay/AetherAI-Studio/pkgs/npm/aetherai-studio) 查看個人主頁與專案源碼。你具備即時深度思維鏈分析能力與自主工具鏈調度權限。面對複雜工程或研發任務，你將以嚴謹、清晰、高度專業的繁體中文提供深度架構方案與精確執行。",
                "enabled_tools": ["web_search", "python_eval", "bash_executor", "file_system", "system_status", "datetime_calc", "read_url", "knowledge_memory", "generate_chart", "http_request_api", "document_text_extractor", "mermaid_generator", "code_linter_analyzer", "ocr_extractor"]
            },
            {
                "id": "coder",
                "name": "首席系統架構師",
                "description": "專精於大型軟體工程、生產級演算法設計、程式碼審查與架構重構",
                "icon": "Code2",
                "system_prompt": "你是一位世界級首席軟體系統架構師。我是由 hankyledevteam 開發的，主要是 Hanson Lee 開發打造（GitHub: https://github.com/hankyleisplay）。你熱愛撰寫優雅、模組化、強健且生產級的高效能程式碼。你可以使用 python_eval 驗證演算法，或使用 file_system 在 workspace 中精準架構專案結構。請隨時提供完備且符合行業最佳實踐的程式碼與技術剖析。",
                "enabled_tools": ["python_eval", "file_system", "bash_executor", "system_status", "generate_chart", "document_text_extractor", "mermaid_generator", "code_linter_analyzer"]
            },
            {
                "id": "researcher",
                "name": "高階技術情報研究員",
                "description": "專攻前沿科技全網檢索、跨領域情報交叉驗證與高價值研報產出",
                "icon": "Search",
                "system_prompt": "你是一名資深高階技術情報分析研究員。我是由 hankyledevteam 開發的，主要是 Hanson Lee 開發打造（GitHub: https://github.com/hankyleisplay）。你擅長使用 web_search 檢索全球一手科技動態，並對複雜來源資訊進行多維度交叉查核與深度結構化研析。請保持嚴密、客觀、高信息密度並附帶完整參考來源。",
                "enabled_tools": ["web_search", "read_url", "datetime_calc", "file_system", "knowledge_memory", "http_request_api", "document_text_extractor", "generate_chart"]
            },
            {
                "id": "sysadmin",
                "name": "雲端基礎設施與 SRE 專家",
                "description": "高可用架構維護、硬體資源監控、自動化維運與系統核心除錯",
                "icon": "Terminal",
                "system_prompt": "你是頂尖企業級雲端基礎設施架構師與站點可靠性工程師 (SRE)。我是由 hankyledevteam 開發的，主要是 Hanson Lee 開發打造（GitHub: https://github.com/hankyleisplay）。你可以調用 system_status 檢視主機 CPU/記憶體/儲存健康度，或使用 bash_executor 執行必要維運命令。請時刻保持零失誤的高可靠性與安全防護準則。",
                "enabled_tools": ["system_status", "bash_executor", "file_system", "datetime_calc", "http_request_api", "code_linter_analyzer"]
            }
        ]
        with self.get_connection() as conn:
            cursor = conn.cursor()
            for p in defaults:
                # Insert if missing
                cursor.execute(
                    "INSERT OR IGNORE INTO personas (id, name, description, icon, system_prompt, enabled_tools) VALUES (?, ?, ?, ?, ?, ?)",
                    (p["id"], p["name"], p["description"], p["icon"], p["system_prompt"], json.dumps(p["enabled_tools"]))
                )
                # Auto-upgrade existing default persona names to enterprise standards
                cursor.execute(
                    "UPDATE personas SET name = ?, description = ?, system_prompt = ?, enabled_tools = ? WHERE id = ?",
                    (p["name"], p["description"], p["system_prompt"], json.dumps(p["enabled_tools"]), p["id"])
                )
            conn.commit()

    # Session CRUD
    def create_session(self, title: str = "新對話", persona_id: str = "assistant", session_id: Optional[str] = None) -> Dict[str, Any]:
        session_id = session_id or str(uuid.uuid4())
        now = datetime.now().isoformat()
        with self.get_connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO sessions (id, title, persona_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (session_id, title, persona_id, now, now)
            )
            conn.commit()
        return {"id": session_id, "title": title, "persona_id": persona_id, "created_at": now, "updated_at": now}

    def list_sessions(self) -> List[Dict[str, Any]]:
        with self.get_connection() as conn:
            rows = conn.execute("SELECT * FROM sessions ORDER BY updated_at DESC").fetchall()
            return [dict(r) for r in rows]

    def search_sessions(self, query: str) -> List[Dict[str, Any]]:
        with self.get_connection() as conn:
            pattern = f"%{query}%"
            rows = conn.execute("""
                SELECT DISTINCT s.* FROM sessions s
                LEFT JOIN messages m ON s.id = m.session_id
                WHERE s.title LIKE ? OR m.content LIKE ?
                ORDER BY s.updated_at DESC
            """, (pattern, pattern)).fetchall()
            return [dict(r) for r in rows]

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        with self.get_connection() as conn:
            row = conn.execute("SELECT * FROM sessions WHERE id = ?", (session_id,)).fetchone()
            return dict(row) if row else None

    def update_session(self, session_id: str, title: Optional[str] = None, persona_id: Optional[str] = None):
        with self.get_connection() as conn:
            now = datetime.now().isoformat()
            if title and persona_id:
                conn.execute("UPDATE sessions SET title = ?, persona_id = ?, updated_at = ? WHERE id = ?", (title, persona_id, now, session_id))
            elif title:
                conn.execute("UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?", (title, now, session_id))
            elif persona_id:
                conn.execute("UPDATE sessions SET persona_id = ?, updated_at = ? WHERE id = ?", (persona_id, now, session_id))
            conn.commit()

    def delete_session(self, session_id: str):
        with self.get_connection() as conn:
            conn.execute("DELETE FROM messages WHERE session_id = ?", (session_id,))
            conn.execute("DELETE FROM sessions WHERE id = ?", (session_id,))
            conn.commit()

    # Messages CRUD
    def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
        thought: str = "",
        tool_calls: Optional[List[Dict[str, Any]]] = None,
        msg_id: Optional[str] = None,
        images: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        actual_id = str(msg_id) if msg_id else str(uuid.uuid4())
        now = datetime.now().isoformat()
        tc_json = json.dumps(tool_calls or [])
        img_json = json.dumps(images or [])
        with self.get_connection() as conn:
            conn.execute(
                "INSERT INTO messages (id, session_id, role, content, thought, tool_calls, images, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (actual_id, session_id, role, content, thought, tc_json, img_json, now)
            )
            conn.execute("UPDATE sessions SET updated_at = ? WHERE id = ?", (now, session_id))
            conn.commit()
        return {
            "id": actual_id,
            "session_id": session_id,
            "role": role,
            "content": content,
            "thought": thought,
            "tool_calls": tool_calls or [],
            "images": images or [],
            "created_at": now
        }

    def get_messages(self, session_id: str) -> List[Dict[str, Any]]:
        with self.get_connection() as conn:
            rows = conn.execute("SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC", (session_id,)).fetchall()
            messages = []
            for r in rows:
                d = dict(r)
                try:
                    d["tool_calls"] = json.loads(d.get("tool_calls") or "[]")
                except Exception:
                    d["tool_calls"] = []
                try:
                    d["images"] = json.loads(d.get("images") or "[]")
                except Exception:
                    d["images"] = []
                messages.append(d)
            return messages

    def toggle_message_bookmark(self, message_id: str) -> bool:
        with self.get_connection() as conn:
            row = conn.execute("SELECT is_bookmarked FROM messages WHERE id = ?", (message_id,)).fetchone()
            if not row:
                return False
            curr = row["is_bookmarked"] or 0
            new_val = 0 if curr else 1
            conn.execute("UPDATE messages SET is_bookmarked = ? WHERE id = ?", (new_val, message_id))
            conn.commit()
            return bool(new_val)

    def get_bookmarked_messages(self) -> List[Dict[str, Any]]:
        with self.get_connection() as conn:
            rows = conn.execute("""
                SELECT m.*, s.title as session_title 
                FROM messages m 
                LEFT JOIN sessions s ON m.session_id = s.id 
                WHERE m.is_bookmarked = 1 
                ORDER BY m.created_at DESC
            """).fetchall()
            messages = []
            for r in rows:
                d = dict(r)
                try:
                    d["tool_calls"] = json.loads(d.get("tool_calls") or "[]")
                except Exception:
                    d["tool_calls"] = []
                messages.append(d)
            return messages

    # Personas
    def list_personas(self) -> List[Dict[str, Any]]:
        with self.get_connection() as conn:
            rows = conn.execute("SELECT * FROM personas").fetchall()
            res = []
            for r in rows:
                d = dict(r)
                try:
                    d["enabled_tools"] = json.loads(d.get("enabled_tools") or "[]")
                except Exception:
                    d["enabled_tools"] = []
                res.append(d)
            return res

    def get_persona(self, persona_id: str) -> Optional[Dict[str, Any]]:
        with self.get_connection() as conn:
            row = conn.execute("SELECT * FROM personas WHERE id = ?", (persona_id,)).fetchone()
            if not row:
                return None
            d = dict(row)
            try:
                d["enabled_tools"] = json.loads(d.get("enabled_tools") or "[]")
            except Exception:
                d["enabled_tools"] = []
            return d

    def save_persona(self, persona: Dict[str, Any]):
        with self.get_connection() as conn:
            conn.execute(
                """
                INSERT INTO personas (id, name, description, icon, system_prompt, enabled_tools)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    description = excluded.description,
                    icon = excluded.icon,
                    system_prompt = excluded.system_prompt,
                    enabled_tools = excluded.enabled_tools
                """,
                (
                    persona["id"],
                    persona["name"],
                    persona["description"],
                    persona.get("icon", "Sparkles"),
                    persona["system_prompt"],
                    json.dumps(persona.get("enabled_tools", []))
                )
            )
            conn.commit()

    # Settings Storage (e.g. active model config)
    def get_setting(self, key: str, default: Any = None) -> Any:
        with self.get_connection() as conn:
            row = conn.execute("SELECT value FROM app_settings WHERE key = ?", (key,)).fetchone()
            if row:
                try:
                    return json.loads(row["value"])
                except Exception:
                    return row["value"]
            return default

    def set_setting(self, key: str, value: Any):
        with self.get_connection() as conn:
            conn.execute(
                "INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (key, json.dumps(value))
            )
            conn.commit()

    # Memory Store CRUD
    def add_memory(self, key: str, content: str, tags: str = "") -> Dict[str, Any]:
        mem_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        with self.get_connection() as conn:
            conn.execute(
                "INSERT INTO memories (id, key, content, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (mem_id, key, content, tags, now, now)
            )
            conn.commit()
        return {"id": mem_id, "key": key, "content": content, "tags": tags, "created_at": now}

    def search_memories(self, query: str) -> List[Dict[str, Any]]:
        with self.get_connection() as conn:
            pattern = f"%{query}%"
            rows = conn.execute(
                "SELECT * FROM memories WHERE key LIKE ? OR content LIKE ? OR tags LIKE ? ORDER BY updated_at DESC",
                (pattern, pattern, pattern)
            ).fetchall()
            return [dict(r) for r in rows]

    def list_memories(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self.get_connection() as conn:
            rows = conn.execute("SELECT * FROM memories ORDER BY updated_at DESC LIMIT ?", (limit,)).fetchall()
            return [dict(r) for r in rows]

    def delete_memory(self, mem_id: str):
        with self.get_connection() as conn:
            conn.execute("DELETE FROM memories WHERE id = ?", (mem_id,))
            conn.commit()

db = Database()

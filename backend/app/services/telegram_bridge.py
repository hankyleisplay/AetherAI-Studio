import asyncio
import logging
import httpx
from typing import Optional, Dict, Any
from datetime import datetime

from backend.app.storage.database import db
from backend.app.llm.provider import ModelConfig
from backend.app.agent.core import AgentOrchestrator
from backend.app.tools.registry import registry

logger = logging.getLogger("AetherAgent.TelegramBridge")
logger.setLevel(logging.INFO)

class TelegramBridgeService:
    def __init__(self):
        self._task: Optional[asyncio.Task] = None
        self._running = False
        self._bot_username: Optional[str] = None
        self._last_active: Optional[str] = None
        self._last_error: Optional[str] = None

    def get_status(self) -> Dict[str, Any]:
        cfg = db.get_setting("telegram_config") or {}
        return {
            "enabled": cfg.get("enabled", False),
            "running": self._running,
            "bot_username": self._bot_username,
            "configured_chat_id": cfg.get("chat_id", ""),
            "has_token": bool(cfg.get("token")),
            "last_active": self._last_active,
            "error": self._last_error
        }

    async def test_connection(self, token: str, chat_id: Optional[str] = None) -> Dict[str, Any]:
        if not token:
            return {"success": False, "error": "Bot Token 不能為空"}
        
        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                # 1. Test getMe
                res = await client.get(f"https://api.telegram.org/bot{token}/getMe")
                if res.status_code != 200:
                    return {"success": False, "error": f"Telegram API 錯誤: HTTP {res.status_code} - {res.text}"}
                
                data = res.json()
                if not data.get("ok"):
                    return {"success": False, "error": data.get("description", "驗證 Token 失敗")}
                
                bot_info = data.get("result", {})
                username = bot_info.get("username", "UnknownBot")
                
                # 2. If chat_id provided, send a test ping message
                if chat_id:
                    ping_text = (
                        "🌟 *AetherAI Studio 2.0 (AetherAgent)*\n\n"
                        "✅ *連線測試成功！*\n"
                        "本地 Agent 橋接服務已就緒，您可以隨時在 Telegram 直接發送指令或問題。"
                    )
                    send_res = await client.post(
                        f"https://api.telegram.org/bot{token}/sendMessage",
                        json={
                            "chat_id": chat_id,
                            "text": ping_text,
                            "parse_mode": "Markdown"
                        }
                    )
                    if send_res.status_code != 200:
                        # Try without markdown in case of formatting issue
                        await client.post(
                            f"https://api.telegram.org/bot{token}/sendMessage",
                            json={
                                "chat_id": chat_id,
                                "text": "🌟 AetherAI Studio 2.0 (AetherAgent) 連線測試成功！"
                            }
                        )

                return {
                    "success": True,
                    "bot_username": f"@{username}",
                    "bot_name": bot_info.get("first_name", ""),
                    "message": f"成功連線至 Bot @{username}！"
                }
            except Exception as e:
                return {"success": False, "error": f"連線測試失敗: {str(e)}"}

    async def start(self):
        if self._running:
            return
        
        cfg = db.get_setting("telegram_config") or {}
        if not cfg.get("enabled", False) or not cfg.get("token"):
            logger.info("Telegram Bridge 未啟用或未設定 Token")
            return

        self._running = True
        self._last_error = None
        self._task = asyncio.create_task(self._poll_loop())
        logger.info("AetherAgent Telegram Bridge 背景輪詢已啟動")

    async def stop(self):
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        self._task = None
        logger.info("AetherAgent Telegram Bridge 已停止")

    async def restart(self):
        await self.stop()
        await self.start()

    async def _send_telegram_message(self, client: httpx.AsyncClient, token: str, chat_id: str, text: str):
        # Telegram has a 4096 character limit per message
        max_len = 4000
        chunks = [text[i:i + max_len] for i in range(0, len(text), max_len)]
        for chunk in chunks:
            try:
                res = await client.post(
                    f"https://api.telegram.org/bot{token}/sendMessage",
                    json={
                        "chat_id": chat_id,
                        "text": chunk,
                        "parse_mode": "Markdown"
                    }
                )
                if res.status_code != 200:
                    # Fallback to plain text if Markdown parsing fails
                    await client.post(
                        f"https://api.telegram.org/bot{token}/sendMessage",
                        json={
                            "chat_id": chat_id,
                            "text": chunk
                        }
                    )
            except Exception as e:
                logger.error(f"發送 Telegram 訊息失敗: {e}")

    async def _send_chat_action(self, client: httpx.AsyncClient, token: str, chat_id: str, action: str = "typing"):
        try:
            await client.post(
                f"https://api.telegram.org/bot{token}/sendChatAction",
                json={"chat_id": chat_id, "action": action}
            )
        except Exception:
            pass

    async def _poll_loop(self):
        offset = 0
        while self._running:
            cfg = db.get_setting("telegram_config") or {}
            token = cfg.get("token")
            configured_chat_id = str(cfg.get("chat_id", "")).strip()

            if not token or not cfg.get("enabled", False):
                self._running = False
                break

            try:
                async with httpx.AsyncClient(timeout=35.0) as client:
                    # If bot username not yet fetched, fetch it
                    if not self._bot_username:
                        try:
                            me_res = await client.get(f"https://api.telegram.org/bot{token}/getMe")
                            if me_res.status_code == 200:
                                self._bot_username = f"@{me_res.json().get('result', {}).get('username', '')}"
                        except Exception:
                            pass

                    # Long poll getUpdates
                    poll_url = f"https://api.telegram.org/bot{token}/getUpdates?offset={offset}&timeout=25"
                    res = await client.get(poll_url)

                    if res.status_code == 200:
                        data = res.json()
                        if data.get("ok"):
                            updates = data.get("result", [])
                            for update in updates:
                                offset = update["update_id"] + 1
                                self._last_active = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                                message = update.get("message")
                                if not message:
                                    continue

                                msg_chat_id = str(message.get("chat", {}).get("id", ""))
                                user_text = message.get("text", "").strip()
                                from_user = message.get("from", {})
                                username = from_user.get("username") or from_user.get("first_name", "User")

                                # Security check: if configured_chat_id is set, only respond to that chat_id
                                if configured_chat_id and msg_chat_id != configured_chat_id:
                                    logger.warning(f"拒絕未授權的 Telegram 存取 (Chat ID: {msg_chat_id})")
                                    continue

                                if not user_text:
                                    continue

                                await self._handle_telegram_message(client, token, msg_chat_id, user_text, username)
                    elif res.status_code == 401:
                        self._last_error = "Telegram Bot Token 無效 (401 Unauthorized)"
                        self._running = False
                        break
                    else:
                        self._last_error = f"Telegram 輪詢錯誤: HTTP {res.status_code}"
                        await asyncio.sleep(5)

            except asyncio.CancelledError:
                break
            except Exception as e:
                self._last_error = f"輪詢例外錯誤: {str(e)}"
                logger.error(f"Telegram 輪詢錯誤: {e}")
                await asyncio.sleep(3)

    async def _handle_telegram_message(self, client: httpx.AsyncClient, token: str, chat_id: str, text: str, username: str):
        # 1. Built-in Commands
        if text.startswith("/start") or text.startswith("/help"):
            welcome = (
                "💧 *歡迎使用 AetherAI Studio 2.0 (AetherAgent)* 💧\n"
                "═══════════════════════\n"
                "您的 Liquid Glass 本地/雲端雙模智能代理已就緒！\n\n"
                "*支援指令：*\n"
                "• `/help` - 顯示本說明選單\n"
                "• `/status` - 查看系統負載與運行狀態\n"
                "• `/tools` - 列出當前啟用的 9 大 Agent 工具\n"
                "• `/new` - 清空記憶並建立新對話\n\n"
                "💬 直接傳送任何訊息，Agent 將自動進行深度思考並視需求調用工具執行！"
            )
            await self._send_telegram_message(client, token, chat_id, welcome)
            return

        if text.startswith("/tools"):
            tools = registry.get_raw_definitions()
            tool_lines = []
            for t in tools:
                status = "✅ 啟用" if t.get("enabled", True) else "❌ 停用"
                tool_lines.append(f"• `{t['name']}`: {t['description']} [{status}]")
            resp = "*🛠️ AetherAgent 內建工具清單：*\n\n" + "\n".join(tool_lines)
            await self._send_telegram_message(client, token, chat_id, resp)
            return

        if text.startswith("/status"):
            active_model = db.get_setting("active_model_config") or {}
            model_name = active_model.get("model", "llama3:latest")
            provider = active_model.get("provider", "ollama")
            status_text = (
                "⚡ *AetherAI Studio 2.0 系統狀態* ⚡\n"
                "═══════════════════════\n"
                f"• *使用中模型*: `{model_name}`\n"
                f"• *供應商*: `{provider}`\n"
                f"• *Telegram 橋接*: 正常運行中 (Active)\n"
                f"• *資料庫*: SQLite 已連線\n"
                f"• *最後活動*: {self._last_active or '剛剛'}\n"
            )
            await self._send_telegram_message(client, token, chat_id, status_text)
            return

        session_id = f"tg_{chat_id}"

        if text.startswith("/new"):
            db.delete_session(session_id)
            db.create_session(title=f"Telegram: @{username}", persona_id="assistant")
            await self._send_telegram_message(client, token, chat_id, "🔄 已成功為您重設對話紀錄，讓我們開始新的對話！")
            return

        # 2. Natural Prompt Execution via AgentOrchestrator
        # Send typing action
        await self._send_chat_action(client, token, chat_id, "typing")

        # Ensure session exists in SQLite
        sess = db.get_session(session_id)
        if not sess:
            db.create_session(title=f"Telegram: @{username}", persona_id="assistant")

        # Load active model config
        saved_cfg = db.get_setting("active_model_config")
        if saved_cfg:
            active_config = ModelConfig(**saved_cfg)
        else:
            active_config = ModelConfig(
                provider="ollama",
                base_url="http://localhost:11434",
                model="llama3:latest"
            )

        orchestrator = AgentOrchestrator(
            config=active_config,
            persona_id="assistant"
        )

        full_response = []
        tool_call_summaries = []

        try:
            async for ev in orchestrator.run_stream(session_id, text):
                ev_type = ev.get("type")
                if ev_type == "tool_call":
                    tool_name = ev.get("name")
                    tool_call_summaries.append(f"⚙️ 正在調用工具: `{tool_name}`...")
                    await self._send_chat_action(client, token, chat_id, "typing")
                elif ev_type == "delta":
                    full_response.append(ev.get("content", ""))
                elif ev_type == "error":
                    full_response.append(f"\n⚠️ 錯誤: {ev.get('error')}")

            final_text = "".join(full_response).strip()

            if not final_text:
                final_text = "（智能體已完成執行，無額外文字輸出）"

            # Prepend tool summary if any were used
            if tool_call_summaries:
                prefix = "\n".join(tool_call_summaries) + "\n\n"
                reply = prefix + final_text
            else:
                reply = final_text

            await self._send_telegram_message(client, token, chat_id, reply)

        except Exception as e:
            logger.error(f"AgentOrchestrator Telegram 執行失敗: {e}")
            await self._send_telegram_message(client, token, chat_id, f"❌ 執行失敗: {str(e)}")

# Global singleton
telegram_bridge = TelegramBridgeService()

import re
import json
import time
from typing import Dict, Any, List, AsyncGenerator, Optional
from pathlib import Path
import base64
from backend.app.llm.provider import UnifiedLLMClient, ModelConfig, LLMResponseChunk
from backend.app.tools.registry import registry
from backend.app.storage.database import db

VISION_MODEL_KEYWORDS = [
    "vl", "vision", "llava", "bakllava", "qwen2.5-vl", "qwen-vl", 
    "minicpm-v", "llama3.2-vision", "moondream", "gemini", "gpt-4o", 
    "gpt-4-vision", "claude-3"
]

def is_vision_model(model_name: str, provider: str = "") -> bool:
    name = (model_name or "").lower()
    prov = (provider or "").lower()
    if prov in ["gemini"]:
        return True
    return any(k in name for k in VISION_MODEL_KEYWORDS)

class AgentOrchestrator:
    def __init__(
        self,
        config: ModelConfig,
        persona_id: str = "assistant",
        mode: str = "chat",
        project: Optional[str] = None,
        code_execution_mode: str = "auto"
    ):
        self.config = config
        self.client = UnifiedLLMClient(config)
        self.persona_id = persona_id
        self.mode = mode
        self.project = project
        self.code_execution_mode = code_execution_mode
        self.max_iterations = 8 if mode == "code" else 6

    def _get_persona_enabled_tools(self) -> Optional[set]:
        persona = db.get_persona(self.persona_id)
        if persona and persona.get("enabled_tools"):
            return set(persona["enabled_tools"])
        return None

    def _get_tools_partition(self) -> tuple[List[Dict[str, Any]], List[str], List[str]]:
        """Returns (active_definitions, active_tool_names, disabled_tool_names)."""
        allowed_tools = self._get_persona_enabled_tools()
        raw_tools = registry.get_raw_definitions()
        active_defs = []
        active_names = []
        disabled_names = []

        for t in raw_tools:
            name = t["name"]
            is_globally_enabled = t.get("enabled", True)
            is_persona_allowed = (allowed_tools is None) or (name in allowed_tools)

            if is_globally_enabled and is_persona_allowed:
                active_defs.append(t)
                active_names.append(name)
            else:
                disabled_names.append(name)

        return active_defs, active_names, disabled_names

    def _get_system_prompt(self) -> str:
        persona = db.get_persona(self.persona_id)
        if persona:
            base_prompt = persona.get("system_prompt", "")
        else:
            base_prompt = "你是 Aether AI Studio 3.0 (AetherAgent) 智能助理。"

        developer_identity = (
            "### 開發者與身分認證 (Developer Identity & Authorship):\n"
            "- 我是由 hankyledevteam 開發的，主要是 Hanson Lee 開發打造。\n"
            "- 當被問及「你是誰開發的？」、「你的作者是誰？」、「誰創造了你？」、「自我介紹」或詢問專案背景時，請務必明確回答：我是由 hankyledevteam 開發的，主要是 Hanson Lee 開發打造，可以去 GitHub 和 npm 查看個人主頁與開源專案。\n"
            "- 個人主頁與專案連結：\n"
            "  * GitHub 個人主頁: https://github.com/hankyleisplay\n"
            "  * GitHub 專案庫: https://github.com/hankyleisplay/AetherAI-Studio\n"
            "  * npm 官方主頁 / 套件庫: https://www.npmjs.com/~hankyleisplay 或 https://github.com/hankyleisplay/AetherAI-Studio/pkgs/npm/aetherai-studio\n"
        )

        active_defs, active_names, disabled_names = self._get_tools_partition()

        # Add ReAct guidance for models that might use text-based reasoning/actions
        tool_desc_list = []
        for t in active_defs:
            tool_desc_list.append(f"- {t['name']}: {t['description']} (Parameters: {json.dumps(t['parameters'])})")
        
        from backend.app.config import settings
        project_dir = settings.workspace_dir
        if self.project:
            projects_meta = db.get_setting("projects_metadata") or {}
            if self.project in projects_meta:
                p_cand = Path(projects_meta[self.project].get("path", ""))
                if p_cand.exists() and p_cand.is_dir():
                    project_dir = p_cand
            elif Path(self.project).exists() and Path(self.project).is_dir():
                project_dir = Path(self.project).resolve()
            else:
                cand = settings.workspace_dir / "projects" / self.project
                if cand.exists() and cand.is_dir():
                    project_dir = cand
                else:
                    cand2 = settings.workspace_dir / self.project
                    if cand2.exists() and cand2.is_dir():
                        project_dir = cand2

        recent_files = []
        if project_dir.exists():
            try:
                for f in sorted(project_dir.rglob("*"), key=lambda x: x.stat().st_mtime if x.is_file() else 0, reverse=True):
                    if f.is_file() and not f.name.startswith(".") and not f.name.endswith(".sqlite") and not f.name.endswith(".db"):
                        rel = str(f.relative_to(project_dir)).replace("\\", "/")
                        recent_files.append(rel)
                        if len(recent_files) >= (30 if self.mode == "code" else 15):
                            break
            except Exception:
                pass

        workspace_context = ""
        if recent_files:
            folder_label = f"專案 '{self.project}'" if self.project else "工作區"
            workspace_context = (
                f"\n\n### Current {folder_label} Files ({folder_label}現有檔案清單):\n"
                f"目前目錄中存在的檔案: {', '.join(recent_files)}。\n"
                "- 當使用者詢問或提及專案代碼、文字或檔案結構時，請直接調用 `file_system` 讀取、分析或寫入對應檔案。"
            )

        disabled_directive = ""
        if disabled_names:
            disabled_directive = (
                "### ⛔ 嚴格禁止與已停用工具清單 (STRICTLY DISABLED TOOLS):\n"
                f"【目前已被停用或未獲授權的工具 ({len(disabled_names)} 個)】: {', '.join(disabled_names)}。\n"
                "【強制遵守的拒絕與回答原則 (MANDATORY RULES)】:\n"
                "1. 你【完全沒有】上述已停用工具的調用權限，後端系統已鎖定並會直接攔截。\n"
                "2. 當使用者詢問「你能不能用某某工具」、「你具備哪些工具」或要求你使用已停用工具時，你【必須誠實且明確告知】該工具目前已被停用或未獲授權，【絕對不可】宣稱自己可以使用、不可回答「我有某工具」或假裝能執行！\n"
                "3. 你的回答必須精準反映當前僅能使用的工具清單（即下方 Available Tools 中列出的已授權工具）。\n"
                "4. 即使系統預設角色描述或先前的對話提及某工具，只要它出現在上述停用名單中，必須以【最新停用狀態】為絕對最高準則！\n\n"
            )

        available_section = "### Available Tools (目前已授權可用工具):\n"
        if tool_desc_list:
            available_section += "\n".join(tool_desc_list) + "\n\n"
        else:
            available_section += "（目前無可用工具，所有工具均已停用）\n\n"

        guidelines = ["### Behavioral Guidelines & Tool Calling:"]
        if "python_eval" in active_names:
            guidelines.append("1. When asked to use Python sandbox (Python 沙盒), execute code, run calculations, or benchmark algorithms, proactively call the `python_eval` tool to compute real results and performance metrics.")
        else:
            guidelines.append("1. Python sandbox (`python_eval`) is currently DISABLED. If asked to run Python code or sandbox calculations, clearly explain that python_eval is currently disabled by user configuration and cannot be executed.")

        guidelines.append("2. When tools return results, provide a comprehensive, fully written final answer in Traditional Chinese with code, output metrics, and deep technical synthesis.")
        guidelines.append("3. If tool calls fail, analyze the error and try an alternative approach or report to the user.")

        if "ocr_extractor" in active_names or "image_to_text" in active_names:
            guidelines.append("4. Multimodal & OCR: When the user asks about an image or visual file (.png, .jpg, .jpeg, .webp), proactively call the `ocr_extractor` tool with the image path to extract and understand its text and data.")
        else:
            guidelines.append("4. Image OCR (`ocr_extractor`) is currently DISABLED. If asked about analyzing image files via OCR, explain that ocr_extractor is disabled by user configuration.")

        guidelines.append("5. Output Requirement: ALWAYS output a full, comprehensive, standalone answer in Content. Even when reasoning internally (Thinking), you MUST deliver your final solution, code, and explanations clearly in Content. Never leave Content empty!")

        guidelines.append(
            "6. 🎭 互動趣味防雷與劇透/暴雷標籤支援 (Interactive Spoilers & Revealable Content):\n"
            "本系統 Liquid Glass 介面全面支援富文本「互動防雷/劇透黑幕」與「折疊彩蛋卡片」語法，請在適合的趣味情境主動使用：\n"
            "  - 行內黑幕防雷：使用 `||劇透文字||` 或 `>!劇透文字!<`，文字會被渲染為具備模糊遮罩的黑幕，使用者需點擊才可揭開查看！（適用：電影/動漫/遊戲結局暴雷、謎語謎底、驚喜彩蛋、冷知識、反轉真相、幽默吐槽）。\n"
            "  - 區塊折疊防雷：使用 `<details><summary>🚨 點擊展開暴雷警告/彩蛋解析</summary>詳細劇透與答案內容...</details>` 產生可點擊展開的趣味折疊卡片。\n"
            "  - 重點標記與按鍵：支援 `==重點高亮==` 與 `<kbd>快捷鍵</kbd>` 標籤。\n"
            "  - 當使用者詢問反轉神作、猜謎解題、要求「劇透」、「暴雷」或探討劇情伏筆時，請主動運用 `||防雷文字||` 與 `<details>` 語法，給予使用者身臨其境的懸疑探索與手動揭曉樂趣！\n"
        )
        temp = float(self.config.temperature if self.config.temperature is not None else 0.7)
        if temp <= 0.3:
            cognitive_directive = (
                f"### 🎯 認知與推論調優指令：【精確嚴謹模式 (Precise & Rigorous)】 (Temperature: {temp}):\n"
                "- 當前推論配置為嚴謹模式。請以高度確定性、縝密的邏輯架構、零假設與邊界條件審查進行推理與代碼構建。\n"
                "- 拒絕模糊猜測，確保每個技術結論、公式計算與系統命令皆有確鑿依據，精確回答使用者問題。\n\n"
            )
        elif temp >= 0.9:
            cognitive_directive = (
                f"### 🎨 認知與推論調優指令：【發散創意模式 (Creative & Visionary)】 (Temperature: {temp}):\n"
                "- 當前推論配置為創意發散模式。鼓勵打破常規框架、進行前瞻性概念延伸、多維度創新方案探索與生動活潑的文風表達。\n"
                "- 提出富有洞見、驚喜構思與多元解法的技術藍圖，充分發揮大模型的想像力與聯想力。\n\n"
            )
        else:
            cognitive_directive = (
                f"### ⚖️ 認知與推論調優指令：【標準平衡模式 (Balanced)】 (Temperature: {temp}):\n"
                "- 兼顧嚴謹性與創新探索，提供客觀、結構清晰、兼具深度與易讀性的完整高品質交付。\n\n"
            )

        emoji_directive = (
            "### 🎨 視覺排版與生動表情符號表達準則 (Vivid Emoji & Visual Style Directive):\n"
            "- 在所有對話回答、步驟指引、程式碼解說、系統日誌、架構分析與重要結論中，請【積極、生動且自然地融入表情符號】（如 🚀, 💻, 🛠️, 💡, ⚡, 🔍, 📦, 🧠, ✅, ⚠️, 🎯, 📌, 🌟, 🛡️, 📂 等）！\n"
            "- 善用表情符號建立清晰的視覺階層與標題排版（例如：🚀 【核心概述】、🛠️ 【技術實作與檔案修改】、💻 【完整原始碼】、⚠️ 【注意事項與邊界條件】、💡 【專家洞察與效能優化】）。\n"
            "- 讓解說親切生動、結構躍然紙上，兼具頂尖專業工程深度與活潑互動體驗。\n\n"
        )

        code_mode_directive = ""
        if self.mode == "code":
            proj_name = self.project or "預設工作區"
            exec_mode = getattr(self, "code_execution_mode", "auto")

            if exec_mode == "accept_edit":
                mode_guidance = (
                    "- 🛡️ 【當前模式：Accept Edit 模式 (代碼審查核准)】：在建立或變更任何專案程式碼檔案（如調用 file_system write/edit）或執行具變更性指令前，你【必須】先向使用者呈現即將變更的檔案路徑與清晰的 Code Diff / 變更預覽，並明確提示：『🛡️ 【代碼變更審查】：請檢視上述預計變更，是否確認接受並執行？』獲得使用者確認後才正式執行變更。\n"
                )
            elif exec_mode == "turbo":
                mode_guidance = (
                    "- ⚡ 【當前模式：Turbo 模式 (極速模式)】：專為極速代碼生成而優化。跳過冗長的思維鋪陳與多餘客套，直接輸出最高效、最簡潔且立即可用的生產級程式碼與關鍵終端命令，最大化輸出速度與 Token 吞吐量！\n"
                )
            else:  # auto
                mode_guidance = (
                    "- 🤖 【當前模式：Auto 模式 (全自動推進)】：你擁有全自動自主研發權限，請自主讀寫專案檔案、調用 bash_executor 與 python_eval 執行單元測試或指令驗證，遇到報錯自動自我閉環修正，全流程主動閉環解決任務，無需反覆詢問使用者。\n"
                )

            code_mode_directive = (
                "### 💻 AETHER CODE AGENT (Claude Code Architecture & Autonomous Software Engineering):\n"
                "你現在處於【Code 模式 (Claude Code Style)】，這是一個專為全端軟體工程、本地模型深度編程、除錯與終端自動化打造的高階工作區模式：\n"
                f"- 📂 專案工程基準：當前活躍專案為 '{proj_name}'，所有代碼編寫與指令執行均以此專案目錄為工作核心。\n"
                f"{mode_guidance}"
                "- 🛠️ 自主工具調用準則：\n"
                "  * 專案代碼讀寫：優先且積極調用 `file_system` 工具（read / write / list），自主建立、分析與修改專案模組程式碼。\n"
                "  * 終端指令與測試執行：主動調用 `bash_executor` 執行專案目錄下的編譯、套件安裝、單元測試、程式運行驗證（例如 `python main.py`、`npm test` 等）。\n"
                "  * 數值演算與邏輯驗證：調用 `python_eval` 執行即時計算與演算法沙盒驗證。\n"
                "  * 版本管理與代碼審查：調用 `git_version_control` 檢視檔案變更或檢查專案 Git 狀態。\n"
                "- 📝 完整代碼輸出保證：Code 模式已全面放寬上下文視窗與 Token 輸出長度限制（Up to 32K~64K Context / 16K Output）！請永遠輸出【完整無省略】、語法正確且具備生產級強健度的完整程式碼，絕對不要使用「// 其餘代碼省略」或「...」！\n"
                "- 🧪 自主閉環除錯：當執行代碼或測試遇到報錯時，自主分析 Stack Trace 與錯誤根因，直接修改檔案並再次執行驗證，直到程式能完美運行。\n"
                "- 🚀 專業結構化總結：完成任務後，使用生動表情符號清楚總結變更檔案清單、核心實現邏輯、測試結果與後續維護建議。\n\n"
            )

        system_instruction = (
            f"{base_prompt}\n\n"
            f"{developer_identity}\n\n"
            f"{code_mode_directive}"
            f"{emoji_directive}"
            f"{cognitive_directive}"
            f"{disabled_directive}"
            f"{available_section}"
            + "\n".join(guidelines)
            + f"{workspace_context}"
        )
        return system_instruction

    def _parse_text_react_action(self, text: str) -> Optional[Dict[str, Any]]:
        """Fallback parser for local models that output ReAct formatted text instead of JSON schema."""
        # Pattern 1: Action: <tool_name>\nAction Input: <args or json>
        action_match = re.search(r"Action:\s*([a-zA-Z0-9_]+)", text, re.IGNORECASE)
        if action_match:
            tool_name = action_match.group(1).strip()
            _, active_names, _ = self._get_tools_partition()
            if tool_name not in active_names:
                return None
            args = {}
            input_match = re.search(r"Action Input:\s*(\{.*?\}|\[.*?\]|.*)", text, re.IGNORECASE | re.DOTALL)
            if input_match:
                raw_input = input_match.group(1).strip()
                try:
                    args = json.loads(raw_input)
                except Exception:
                    # heuristic single argument fallback
                    args = {"input": raw_input}
            return {"name": tool_name, "args": args}
        return None

    def _build_conversation_context(self, history: List[Dict[str, Any]], user_prompt: str) -> List[Dict[str, Any]]:
        """
        Construct a token-efficient, context-safe message history.
        1. Ensures conversation starts with a 'user' message (never a dangling 'assistant').
        2. Caps total historical characters to stay well within model context limits.
        3. Condenses overly long historical messages (e.g. huge code dumps or large outputs).
        """
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": self._get_system_prompt()}
        ]

        # Prior history excludes the last message if it's the current user prompt
        prior_history = history[:-1] if len(history) > 1 else []
        if not prior_history:
            messages.append({"role": "user", "content": user_prompt})
            return messages

        # Budget: in Code Mode, context window is enlarged significantly (up to 120,000 characters ~30,000 tokens)
        max_history_chars = 120000 if self.mode == "code" else 24000
        msg_max_limit = 25000 if self.mode == "code" else 3500
        max_turns = 32 if self.mode == "code" else 16
        current_chars = 0
        selected_history: List[Dict[str, Any]] = []

        # Traverse backwards to prioritize most recent conversation turns
        for msg in reversed(prior_history):
            role = msg.get("role")
            if role not in ["user", "assistant"]:
                continue

            raw_content = msg.get("content", "")
            # If an individual historical message is excessively large, condense its middle
            if len(raw_content) > msg_max_limit:
                content = (
                    raw_content[:int(msg_max_limit * 0.6)]
                    + "\n\n... [為保留上下文長度，歷史超長訊息中間已省略] ...\n\n"
                    + raw_content[-int(msg_max_limit * 0.35):]
                )
            else:
                content = raw_content

            msg_len = len(content)
            # Only stop if we've accumulated at least 4 turns and exceed the char budget
            if current_chars + msg_len > max_history_chars and len(selected_history) >= 4:
                break

            selected_history.append({"role": role, "content": content})
            current_chars += msg_len
            # Keep at most max_turns messages
            if len(selected_history) >= max_turns:
                break

        # Reverse back to chronological order
        selected_history.reverse()

        # Ensure the conversation starts with a user message (drop leading assistant turn)
        while selected_history and selected_history[0]["role"] != "user":
            selected_history.pop(0)

        messages.extend(selected_history)
        messages.append({"role": "user", "content": user_prompt})
        return messages

    async def _extract_vision_description(self, clean_b64: str) -> str:
        """
        Background visual feature and structure extraction for pure-text models (Track B):
        1. Checks local Ollama for any multimodal vision model (qwen2.5-vl, llava, etc.)
        2. Fallbacks to native Windows OCR engine (Windows.Media.Ocr via tool_ocr_extractor)
        """
        # 1. Probe local Ollama for an installed vision model
        try:
            import httpx
            base_url = getattr(self.config, "base_url", "http://localhost:11434")
            async with httpx.AsyncClient(timeout=10.0) as client:
                tags_resp = await client.get(f"{base_url.rstrip('/')}/api/tags")
                if tags_resp.status_code == 200:
                    tags_data = tags_resp.json()
                    installed = [m.get("name") for m in tags_data.get("models", []) if m.get("name")]
                    vision_candidate = next((m for m in installed if is_vision_model(m)), None)
                    if vision_candidate:
                        prompt = (
                            "請以繁體中文深度且結構化解析這張圖片：\n"
                            "1. 圖像主題、場景與主體描述\n"
                            "2. 圖片中的所有可見文字、標籤與數值\n"
                            "3. 介面結構、圖表或關鍵細節\n"
                            "4. 核心資訊重點摘要"
                        )
                        chat_payload = {
                            "model": vision_candidate,
                            "messages": [{
                                "role": "user",
                                "content": prompt,
                                "images": [clean_b64]
                            }],
                            "stream": False
                        }
                        chat_resp = await client.post(f"{base_url.rstrip('/')}/api/chat", json=chat_payload, timeout=60.0)
                        if chat_resp.status_code == 200:
                            desc = chat_resp.json().get("message", {}).get("content", "").strip()
                            if desc:
                                return f"【後台視覺模型 ({vision_candidate}) 結構化解析】:\n{desc}"
        except Exception:
            pass

        # 2. Fallback to Windows native high-precision OCR engine
        try:
            from backend.app.config import settings
            workspace_dir = settings.workspace_dir.resolve()
            img_bytes = base64.b64decode(clean_b64)
            temp_img_name = f"uploaded_img_{int(time.time()*1000)}.png"
            temp_img_path = workspace_dir / temp_img_name
            with open(temp_img_path, "wb") as f:
                f.write(img_bytes)
            
            ocr_tool = registry._tools.get("ocr_extractor")
            if ocr_tool:
                ocr_result = ocr_tool(path=temp_img_name, max_chars=5000, extract_structure=True)
                return f"【原生視覺文字識別 (Windows OCR) 提取內容】:\n{ocr_result}\n- 圖像檔案已安全儲存於工作區: `{temp_img_name}`"
        except Exception as e:
            return f"【視覺提取提示】: 收到圖片 (長度 {len(clean_b64)} 字元)，但解析時發生異常: {str(e)}"
        
        return "【視覺提取提示】: 收到圖片，但未檢測到可用的後台視覺模型或 OCR 引擎。"

    async def run_stream(
        self,
        session_id: str,
        user_prompt: str,
        user_message_id: Optional[str] = None,
        assistant_message_id: Optional[str] = None,
        images: Optional[List[str]] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Execute agent reasoning loop with SSE events and Dual-Track Vision Perception.
        """
        # Clean images (strip data:image/...;base64, prefix)
        clean_images = []
        if images:
            for img in images:
                if img and isinstance(img, str):
                    c = re.sub(r"^data:image\/[a-zA-Z0-9\+\-\.]+;base64,", "", img).strip()
                    if c:
                        clean_images.append(c)

        # Save user message to database with pre-assigned ID and images
        user_msg = db.add_message(
            session_id=session_id,
            role="user",
            content=user_prompt,
            msg_id=user_message_id,
            images=clean_images
        )

        effective_prompt = user_prompt
        is_multimodal = is_vision_model(self.config.model, self.config.provider)

        # Immediately emit session info so client starts message lifecycle right away
        yield {
            "type": "session_info",
            "session_id": session_id,
            "user_message_id": user_msg["id"],
            "assistant_message_id": assistant_message_id
        }

        # Dual-track vision processing:
        if clean_images:
            if is_multimodal:
                # Track A: Active model is multimodal (qwen2.5-vl, llava, gemini, etc.)
                yield {
                    "type": "status",
                    "stage": "thinking",
                    "text": f"偵測到多模態視覺模型 ({self.config.model})，正在發送圖像進行端對端視覺認知..."
                }
            else:
                # Track B: Active model is pure-text (llama3, deepseek, etc.)
                # Extract structured visual description in background first!
                yield {
                    "type": "status",
                    "stage": "thinking",
                    "text": "檢測到純文字模型，正在後台調用視覺認知引擎提取圖片細節與結構化資訊..."
                }
                vision_reports = []
                for idx, c_img in enumerate(clean_images):
                    report = await self._extract_vision_description(c_img)
                    vision_reports.append(f"### [圖片 #{idx+1} 分析與文字結構]\n{report}")
                
                combined_vision_report = "\n\n".join(vision_reports)
                prompt_text = user_prompt.strip() if user_prompt.strip() else "請根據上述圖片分析結果進行深度解讀、摘要重點與解答。"
                effective_prompt = (
                    f"【🖼️ 視覺認知系統 - 圖像結構化分析報告】\n"
                    f"系統已在後台為您預先解析使用者隨訊息附加的圖片：\n\n"
                    f"{combined_vision_report}\n\n"
                    f"============================================================\n"
                    f"【使用者指令與提問】：\n{prompt_text}"
                )
                yield {
                    "type": "status",
                    "stage": "thinking",
                    "text": "視覺特徵已結構化提取完成，正在結合問題進行深度推論..."
                }
        else:
            yield {
                "type": "status",
                "stage": "thinking",
                "text": "正在深度推理與檢索知識庫..."
            }

        # Retrieve session context and build safe conversation history
        history = db.get_messages(session_id)
        messages = self._build_conversation_context(history, effective_prompt)

        # If multimodal model, attach clean_images directly to the current user turn
        if clean_images and is_multimodal and messages:
            messages[-1]["images"] = clean_images

        # Get enabled tools filtered by active persona and global registry toggle
        active_defs, active_names, disabled_names = self._get_tools_partition()
        tools_schema = [
            t for t in registry.get_definitions(enabled_only=True)
            if t["function"]["name"] in active_names
        ]

        full_thought = ""
        full_content = ""
        executed_tool_calls = []

        iteration = 0
        has_emitted_generating = False
        final_finish_reason: Optional[str] = None
        while iteration < self.max_iterations:
            iteration += 1
            current_turn_content = ""
            current_turn_thought = ""
            current_tool_calls: List[Dict[str, Any]] = []
            turn_finish_reason: Optional[str] = None

            async for chunk in self.client.stream_chat(messages, tools=tools_schema):
                if chunk.type == "thought" and chunk.content:
                    current_turn_thought += chunk.content
                    full_thought += chunk.content
                    yield {"type": "thought", "content": chunk.content}

                elif chunk.type == "token" and chunk.content:
                    if not has_emitted_generating:
                        has_emitted_generating = True
                        yield {"type": "status", "stage": "generating", "text": "正在組織並生成最佳解答..."}
                    current_turn_content += chunk.content
                    full_content += chunk.content
                    yield {"type": "token", "content": chunk.content}

                elif chunk.type == "tool_call":
                    current_tool_calls.append({
                        "id": chunk.tool_call_id or f"call_{int(time.time()*1000)}",
                        "name": chunk.tool_name,
                        "args": chunk.tool_args or {}
                    })

                elif chunk.type == "done":
                    if chunk.metadata and "finish_reason" in chunk.metadata:
                        turn_finish_reason = chunk.metadata["finish_reason"]

                elif chunk.type == "error":
                    yield {"type": "error", "error": chunk.content}
                    # Save error message to DB so conversation state is preserved
                    db.add_message(
                        session_id=session_id,
                        role="assistant",
                        content=full_content or f"❌ 執行錯誤: {chunk.content}",
                        thought=full_thought,
                        tool_calls=executed_tool_calls,
                        msg_id=assistant_message_id
                    )
                    return

            # Check if text fallback ReAct action is present if no native tool call was detected
            if not current_tool_calls and current_turn_content:
                fallback = self._parse_text_react_action(current_turn_content)
                if fallback and fallback["name"] in active_names:
                    current_tool_calls.append({
                        "id": f"fallback_{int(time.time()*1000)}",
                        "name": fallback["name"],
                        "args": fallback["args"]
                    })

            # If tool calls were made, execute them and continue loop
            if current_tool_calls:
                # Add assistant's message with tool call to context
                messages.append({
                    "role": "assistant",
                    "content": current_turn_content,
                    "tool_calls": [
                        {
                            "id": tc["id"],
                            "type": "function",
                            "function": {
                                "name": tc["name"],
                                "arguments": tc["args"] if isinstance(tc.get("args"), dict) else json.loads(tc.get("args", "{}"))
                            }
                        }
                        for tc in current_tool_calls
                    ]
                })

                for tc in current_tool_calls:
                    tool_name = tc["name"]
                    tool_args = tc["args"]
                    tool_id = tc["id"]

                    yield {
                        "type": "tool_start",
                        "id": tool_id,
                        "name": tool_name,
                        "args": tool_args
                    }

                    # Safety Authorization Check: Intercept disabled or unauthorized tools
                    if tool_name not in active_names:
                        duration = 0
                        output_str = f"❌ 【安全防護攔截】：工具 '{tool_name}' 目前已被使用者或角色設定停用。你目前完全無法使用此工具，請明確向使用者說明此工具已停用。"
                        tool_record = {
                            "id": tool_id,
                            "name": tool_name,
                            "args": tool_args,
                            "output": output_str,
                            "success": False,
                            "duration": duration
                        }
                        executed_tool_calls.append(tool_record)
                        yield {
                            "type": "tool_result",
                            "id": tool_id,
                            "name": tool_name,
                            "output": output_str,
                            "success": False,
                            "duration": duration
                        }
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_id,
                            "name": tool_name,
                            "content": output_str
                        })
                        continue

                    # Execute tool
                    result = await registry.execute(tool_name, tool_args)
                    duration = result.get("duration_seconds", 0)
                    output_str = str(result.get("output") if result.get("success") else result.get("error"))

                    tool_record = {
                        "id": tool_id,
                        "name": tool_name,
                        "args": tool_args,
                        "output": output_str,
                        "success": result.get("success", False),
                        "duration": duration
                    }
                    executed_tool_calls.append(tool_record)

                    yield {
                        "type": "tool_result",
                        "id": tool_id,
                        "name": tool_name,
                        "output": output_str,
                        "success": result.get("success", False),
                        "duration": duration
                    }

                    # Append tool result to context with safe length budgeting
                    tool_content_for_llm = output_str
                    if len(tool_content_for_llm) > 4000:
                        tool_content_for_llm = (
                            tool_content_for_llm[:3000]
                            + f"\n\n... [工具輸出過長，總計 {len(output_str)} 字，已節錄前 3000 字元以確保對話完整生成] ..."
                        )

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_id,
                        "name": tool_name,
                        "content": tool_content_for_llm
                    })

                # Proceed to next iteration of reasoning loop
                continue

            else:
                # Final response reached
                final_finish_reason = turn_finish_reason
                break

        # If terminal response was truncated due to token limit, cleanly append notice at the end
        if final_finish_reason in ("length", "max_tokens", "MAX_TOKENS"):
            notice = "\n\n> ⚠️ **提示**：模型生成已達本次最大長度上限（Token Limit）。如需接續未完成內容，請輸入「請繼續」。"
            full_content += notice
            yield {"type": "token", "content": notice}

        # Ensure full_content is never completely blank if thoughts or tools occurred
        if not full_content.strip():
            if full_thought.strip():
                # If the reasoning model outputted its analysis/code in the thinking stream,
                # promote it to the response body so the user receives a complete deliverable.
                full_content = full_thought.strip()
            elif executed_tool_calls:
                # If tools were executed but model provided no final text, present tool results cleanly
                tool_summaries = []
                for tc in executed_tool_calls:
                    name = tc.get("name")
                    out = tc.get("output", "")
                    tool_summaries.append(f"### 工具 `{name}` 執行成果：\n```\n{out}\n```")
                full_content = "已成功完成工具執行，以下為運行成果：\n\n" + "\n\n".join(tool_summaries)
            else:
                full_content = "（模型推論結束，未產生回應內容。請嘗試重新提問或調整提示詞。）"

        # Save assistant response to DB
        saved_msg = db.add_message(
            session_id=session_id,
            role="assistant",
            content=full_content,
            thought=full_thought,
            tool_calls=executed_tool_calls,
            msg_id=assistant_message_id
        )

        yield {
            "type": "done",
            "message_id": saved_msg["id"],
            "session_id": session_id,
            "executed_tools": len(executed_tool_calls),
            "content": full_content,
            "thought": full_thought
        }

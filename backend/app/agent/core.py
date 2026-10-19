import re
import json
import time
from typing import Dict, Any, List, AsyncGenerator, Optional
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
    def __init__(self, config: ModelConfig, persona_id: str = "assistant"):
        self.config = config
        self.client = UnifiedLLMClient(config)
        self.persona_id = persona_id
        self.max_iterations = 6

    def _get_persona_enabled_tools(self) -> Optional[set]:
        persona = db.get_persona(self.persona_id)
        if persona and persona.get("enabled_tools"):
            return set(persona["enabled_tools"])
        return None

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

        allowed_tools = self._get_persona_enabled_tools()
        # Add ReAct guidance for models that might use text-based reasoning/actions
        tool_desc_list = []
        raw_tools = registry.get_raw_definitions()
        for t in raw_tools:
            if t.get("enabled") and (allowed_tools is None or t["name"] in allowed_tools):
                tool_desc_list.append(f"- {t['name']}: {t['description']} (Parameters: {json.dumps(t['parameters'])})")
        
        from backend.app.config import settings
        workspace_dir = settings.workspace_dir
        recent_files = []
        if workspace_dir.exists():
            try:
                for f in sorted(workspace_dir.rglob("*"), key=lambda x: x.stat().st_mtime if x.is_file() else 0, reverse=True):
                    if f.is_file() and not f.name.startswith(".") and not f.name.endswith(".sqlite") and not f.name.endswith(".db"):
                        rel = str(f.relative_to(workspace_dir)).replace("\\", "/")
                        recent_files.append(rel)
                        if len(recent_files) >= 12:
                            break
            except Exception:
                pass

        workspace_context = ""
        if recent_files:
            workspace_context = (
                f"\n\n### Current Workspace Files (工作區現有檔案):\n"
                f"目前工作區中存在的檔案: {', '.join(recent_files)}。\n"
                "- 當用戶詢問或提及上述檔案、圖片、截圖或上傳項目時，請直接調用相應工具讀取與分析（圖像使用 `ocr_extractor`，代碼與文字檔案使用 `file_system` 或 `document_text_extractor`）。"
            )

        system_instruction = (
            f"{base_prompt}\n\n"
            f"{developer_identity}\n\n"
            f"### Available Tools:\n" + "\n".join(tool_desc_list) + "\n\n"
            "### Behavioral Guidelines & Tool Calling:\n"
            "1. When asked to use Python sandbox (Python 沙盒), execute code, run calculations, or benchmark algorithms, proactively call the `python_eval` tool to compute real results and performance metrics.\n"
            "2. When tools return results, provide a comprehensive, fully written final answer in Traditional Chinese with code, output metrics, and deep technical synthesis.\n"
            "3. If tool calls fail, analyze the error and try an alternative approach or report to the user.\n"
            "4. Multimodal & OCR: When the user asks about an image or visual file (.png, .jpg, .jpeg, .webp), proactively call the `ocr_extractor` tool with the image path to extract and understand its text and data.\n"
            "5. Output Requirement: ALWAYS output a full, comprehensive, standalone answer in Content. Even when reasoning internally (Thinking), you MUST deliver your final solution, code, and explanations clearly in Content. Never leave Content empty!"
            f"{workspace_context}"
        )
        return system_instruction

    def _parse_text_react_action(self, text: str) -> Optional[Dict[str, Any]]:
        """Fallback parser for local models that output ReAct formatted text instead of JSON schema."""
        # Pattern 1: Action: <tool_name>\nAction Input: <args or json>
        action_match = re.search(r"Action:\s*([a-zA-Z0-9_]+)", text, re.IGNORECASE)
        if action_match:
            tool_name = action_match.group(1).strip()
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

        # Budget: up to 24,000 characters (~6,000 tokens) for prior dialogue
        max_history_chars = 24000
        current_chars = 0
        selected_history: List[Dict[str, Any]] = []

        # Traverse backwards to prioritize most recent conversation turns
        for msg in reversed(prior_history):
            role = msg.get("role")
            if role not in ["user", "assistant"]:
                continue

            raw_content = msg.get("content", "")
            # If an individual historical message is excessively large, condense its middle
            if len(raw_content) > 3500:
                content = (
                    raw_content[:2000]
                    + "\n\n... [為保留上下文長度，歷史超長訊息中間已省略] ...\n\n"
                    + raw_content[-1200:]
                )
            else:
                content = raw_content

            msg_len = len(content)
            # Only stop if we've accumulated at least 4 turns and exceed the char budget
            if current_chars + msg_len > max_history_chars and len(selected_history) >= 4:
                break

            selected_history.append({"role": role, "content": content})
            current_chars += msg_len
            # Keep at most 16 messages
            if len(selected_history) >= 16:
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

        # Get enabled tools filtered by active persona
        allowed_tools = self._get_persona_enabled_tools()
        tools_schema = [
            t for t in registry.get_definitions(enabled_only=True)
            if allowed_tools is None or t["function"]["name"] in allowed_tools
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
                        tool_calls=executed_tool_calls
                    )
                    return

            # Check if text fallback ReAct action is present if no native tool call was detected
            if not current_tool_calls and current_turn_content:
                fallback = self._parse_text_react_action(current_turn_content)
                if fallback and fallback["name"] in registry._tools:
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

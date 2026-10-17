import re
import json
import time
from typing import Dict, Any, List, AsyncGenerator, Optional
from backend.app.llm.provider import UnifiedLLMClient, ModelConfig, LLMResponseChunk
from backend.app.tools.registry import registry
from backend.app.storage.database import db

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
            base_prompt = "你是 AetherAI Studio 2.0 (AetherAgent) 智能助理。"

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
        
        system_instruction = (
            f"{base_prompt}\n\n"
            f"{developer_identity}\n\n"
            f"### Available Tools:\n" + "\n".join(tool_desc_list) + "\n\n"
            "### Behavioral Guidelines:\n"
            "1. If a question requires real-time facts, calculations, file manipulation, or system details, proactively use the available tools.\n"
            "2. When tools return results, synthesize them clearly and answer accurately.\n"
            "3. If tool calls fail, analyze the error and try an alternative approach or report to the user.\n"
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

    async def run_stream(
        self,
        session_id: str,
        user_prompt: str
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Execute agent reasoning loop with SSE events:
        - {"type": "session_info", ...}
        - {"type": "thought", "content": ...}
        - {"type": "tool_start", "name": ..., "args": ...}
        - {"type": "tool_result", "name": ..., "output": ..., "duration": ...}
        - {"type": "token", "content": ...}
        - {"type": "done", "message_id": ...}
        - {"type": "error", "error": ...}
        """
        # Save user message to database
        db.add_message(session_id=session_id, role="user", content=user_prompt)

        # Retrieve session context and build safe conversation history
        history = db.get_messages(session_id)
        messages = self._build_conversation_context(history, user_prompt)

        # Immediately emit thinking status so client starts feedback cycle right away
        yield {
            "type": "status",
            "stage": "thinking",
            "text": "正在深度推理與檢索知識庫..."
        }

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
        while iteration < self.max_iterations:
            iteration += 1
            current_turn_content = ""
            current_turn_thought = ""
            current_tool_calls: List[Dict[str, Any]] = []

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
                break

        # Ensure full_content is never completely blank if thoughts or tools occurred
        if not full_content.strip():
            if full_thought.strip():
                full_content = "（模型已完成深度思維推論，未輸出額外正文。請展開上方思維鏈查看推理過程。）"
            elif executed_tool_calls:
                full_content = "（已完成所有工具調用序列執行。）"

        # Save assistant response to DB
        saved_msg = db.add_message(
            session_id=session_id,
            role="assistant",
            content=full_content,
            thought=full_thought,
            tool_calls=executed_tool_calls
        )

        yield {
            "type": "done",
            "message_id": saved_msg["id"],
            "session_id": session_id,
            "executed_tools": len(executed_tool_calls),
            "content": full_content,
            "thought": full_thought
        }

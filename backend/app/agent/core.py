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

    def _get_system_prompt(self) -> str:
        persona = db.get_persona(self.persona_id)
        if persona:
            base_prompt = persona.get("system_prompt", "")
        else:
            base_prompt = "You are a helpful and intelligent AI assistant."

        # Add ReAct guidance for models that might use text-based reasoning/actions
        tool_desc_list = []
        raw_tools = registry.get_raw_definitions()
        for t in raw_tools:
            if t.get("enabled"):
                tool_desc_list.append(f"- {t['name']}: {t['description']} (Parameters: {json.dumps(t['parameters'])})")
        
        system_instruction = (
            f"{base_prompt}\n\n"
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

        # Retrieve session context
        history = db.get_messages(session_id)
        # Construct message list for LLM
        messages: List[Dict[str, Any]] = [
            {"role": "system", "content": self._get_system_prompt()}
        ]
        
        # Take last 10 messages for context window management
        recent_history = history[-11:-1] if len(history) > 1 else []
        for h in recent_history:
            role = h["role"]
            if role in ["user", "assistant"]:
                messages.append({"role": role, "content": h["content"]})

        messages.append({"role": "user", "content": user_prompt})

        # Get enabled tools
        tools_schema = registry.get_definitions(enabled_only=True)

        full_thought = ""
        full_content = ""
        executed_tool_calls = []

        iteration = 0
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
                    current_turn_content += chunk.content
                    # We only yield content to user if we're not currently gathering a tool call
                    yield {"type": "token", "content": chunk.content}

                elif chunk.type == "tool_call":
                    current_tool_calls.append({
                        "id": chunk.tool_call_id or f"call_{int(time.time()*1000)}",
                        "name": chunk.tool_name,
                        "args": chunk.tool_args or {}
                    })

                elif chunk.type == "error":
                    yield {"type": "error", "error": chunk.content}
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
                                "arguments": json.dumps(tc["args"])
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

                    # Append tool result to context
                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_id,
                        "name": tool_name,
                        "content": output_str
                    })

                # Proceed to next iteration of reasoning loop
                continue

            else:
                # Final response reached
                full_content += current_turn_content
                break

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
            "executed_tools": len(executed_tool_calls)
        }

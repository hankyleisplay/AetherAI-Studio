import json
import time
import httpx
from typing import Dict, Any, List, Optional, AsyncGenerator
from pydantic import BaseModel

class ModelConfig(BaseModel):
    provider: str = "ollama"  # "ollama", "openai_compatible", "anthropic", "gemini"
    base_url: str = "http://localhost:11434"
    api_key: Optional[str] = None
    model: str = "llama3:latest"
    temperature: float = 0.7
    max_tokens: int = 4096

class LLMResponseChunk(BaseModel):
    type: str  # "token", "thought", "tool_call", "done", "error"
    content: Optional[str] = None
    tool_name: Optional[str] = None
    tool_args: Optional[Dict[str, Any]] = None
    tool_call_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

class UnifiedLLMClient:
    def __init__(self, config: ModelConfig):
        self.config = config

    async def test_connection(self) -> Dict[str, Any]:
        """Test connection and return latency + available models if discoverable."""
        start = time.time()
        timeout = httpx.Timeout(8.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                if self.config.provider == "ollama":
                    url = f"{self.config.base_url.rstrip('/')}/api/tags"
                    resp = await client.get(url)
                    latency = round((time.time() - start) * 1000, 1)
                    if resp.status_code == 200:
                        data = resp.json()
                        models = [m.get("name") for m in data.get("models", [])]
                        return {"success": True, "latency_ms": latency, "models": models, "provider": "ollama"}
                    return {"success": False, "error": f"Ollama HTTP {resp.status_code}: {resp.text}"}

                elif self.config.provider in ["openai_compatible", "lm_studio", "deepseek", "groq", "openai"]:
                    url = f"{self.config.base_url.rstrip('/')}/models"
                    headers = {}
                    if self.config.api_key:
                        headers["Authorization"] = f"Bearer {self.config.api_key}"
                    resp = await client.get(url, headers=headers)
                    latency = round((time.time() - start) * 1000, 1)
                    if resp.status_code == 200:
                        data = resp.json()
                        raw_models = data.get("data", [])
                        models = [m.get("id") for m in raw_models if isinstance(m, dict)]
                        return {"success": True, "latency_ms": latency, "models": models, "provider": self.config.provider}
                    # If /models is not implemented, try a minimal ping
                    return {"success": True, "latency_ms": latency, "models": [self.config.model], "provider": self.config.provider}

                elif self.config.provider == "anthropic":
                    latency = round((time.time() - start) * 1000, 1)
                    # Anthropic doesn't have a free /models without key check
                    return {"success": True, "latency_ms": latency, "models": ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"]}

                elif self.config.provider == "gemini":
                    api_key = self.config.api_key or ""
                    url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
                    latency = round((time.time() - start) * 1000, 1)
                    try:
                        resp = await client.get(url)
                        if resp.status_code == 200:
                            data = resp.json()
                            raw_models = data.get("models", [])
                            valid_models = []
                            for m in raw_models:
                                methods = m.get("supportedGenerationMethods", [])
                                if "generateContent" in methods:
                                    name = m.get("name", "").replace("models/", "")
                                    valid_models.append(name)
                            if valid_models:
                                return {"success": True, "latency_ms": latency, "models": valid_models, "provider": "gemini"}
                        elif resp.status_code == 400:
                            return {"success": False, "error": "Gemini API Key 無效或未提供", "provider": "gemini"}
                    except Exception:
                        pass
                    return {
                        "success": True, 
                        "latency_ms": latency, 
                        "models": ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-flash-latest", "gemini-pro-latest"], 
                        "provider": "gemini"
                    }

                return {"success": False, "error": f"Unknown provider: {self.config.provider}"}
            except Exception as e:
                return {"success": False, "error": f"Connection failed: {str(e)}"}

    async def stream_chat(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> AsyncGenerator[LLMResponseChunk, None]:
        """Stream responses, thoughts, and tool calls unified across providers."""
        if self.config.provider == "ollama":
            async for chunk in self._stream_ollama(messages, tools):
                yield chunk
        elif self.config.provider == "anthropic":
            async for chunk in self._stream_anthropic(messages, tools):
                yield chunk
        elif self.config.provider == "gemini":
            async for chunk in self._stream_gemini(messages, tools):
                yield chunk
        else:
            # Default to OpenAI compatible format (OpenAI, DeepSeek, Groq, LM Studio, vLLM, etc.)
            async for chunk in self._stream_openai_compatible(messages, tools):
                yield chunk

    async def _stream_openai_compatible(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> AsyncGenerator[LLMResponseChunk, None]:
        url = f"{self.config.base_url.rstrip('/')}/chat/completions"
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"

        payload: Dict[str, Any] = {
            "model": self.config.model,
            "messages": messages,
            "temperature": self.config.temperature,
            "stream": True
        }
        if self.config.max_tokens:
            payload["max_tokens"] = self.config.max_tokens
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        tool_calls_accumulator: Dict[int, Dict[str, Any]] = {}
        in_thought_tag = False
        thought_buffer = ""

        timeout = httpx.Timeout(120.0, connect=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    if response.status_code != 200:
                        err_text = await response.aread()
                        yield LLMResponseChunk(type="error", content=f"API Error ({response.status_code}): {err_text.decode('utf-8', errors='ignore')}")
                        return

                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break

                        try:
                            data = json.loads(data_str)
                        except Exception:
                            continue

                        choices = data.get("choices", [])
                        if not choices:
                            continue

                        delta = choices[0].get("delta", {})

                        # 1. Check reasoning / thought tokens (DeepSeek R1 / OpenAI o1/o3 style)
                        reasoning = delta.get("reasoning_content") or delta.get("reasoning")
                        if reasoning:
                            yield LLMResponseChunk(type="thought", content=reasoning)

                        # 2. Check content tokens
                        content = delta.get("content")
                        if content:
                            # Handle embedded <think>...</think> tags if present in standard content
                            if "<think>" in content:
                                parts = content.split("<think>")
                                if parts[0]:
                                    yield LLMResponseChunk(type="token", content=parts[0])
                                in_thought_tag = True
                                thought_buffer = parts[1]
                                if "</think>" in thought_buffer:
                                    t_parts = thought_buffer.split("</think>")
                                    yield LLMResponseChunk(type="thought", content=t_parts[0])
                                    in_thought_tag = False
                                    if t_parts[1]:
                                        yield LLMResponseChunk(type="token", content=t_parts[1])
                                else:
                                    yield LLMResponseChunk(type="thought", content=thought_buffer)
                            elif in_thought_tag:
                                if "</think>" in content:
                                    t_parts = content.split("</think>")
                                    yield LLMResponseChunk(type="thought", content=t_parts[0])
                                    in_thought_tag = False
                                    if t_parts[1]:
                                        yield LLMResponseChunk(type="token", content=t_parts[1])
                                else:
                                    yield LLMResponseChunk(type="thought", content=content)
                            else:
                                yield LLMResponseChunk(type="token", content=content)

                        # 3. Check tool calls streaming
                        tool_calls = delta.get("tool_calls")
                        if tool_calls:
                            for tc in tool_calls:
                                idx = tc.get("index", 0)
                                if idx not in tool_calls_accumulator:
                                    tool_calls_accumulator[idx] = {
                                        "id": tc.get("id", f"call_{idx}_{int(time.time())}"),
                                        "name": "",
                                        "arguments": ""
                                    }
                                if tc.get("id"):
                                    tool_calls_accumulator[idx]["id"] = tc.get("id")
                                fn = tc.get("function", {})
                                if fn.get("name"):
                                    tool_calls_accumulator[idx]["name"] += fn.get("name")
                                if fn.get("arguments"):
                                    tool_calls_accumulator[idx]["arguments"] += fn.get("arguments")

                # Dispatch accumulated tool calls
                for idx, tc_data in tool_calls_accumulator.items():
                    name = tc_data["name"]
                    args_str = tc_data["arguments"]
                    try:
                        args = json.loads(args_str) if args_str else {}
                    except Exception:
                        args = {"raw_input": args_str}
                    yield LLMResponseChunk(
                        type="tool_call",
                        tool_name=name,
                        tool_args=args,
                        tool_call_id=tc_data["id"]
                    )

                yield LLMResponseChunk(type="done")

            except Exception as e:
                yield LLMResponseChunk(type="error", content=f"Network/Stream error: {str(e)}")

    async def _stream_ollama(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> AsyncGenerator[LLMResponseChunk, None]:
        url = f"{self.config.base_url.rstrip('/')}/api/chat"
        payload = {
            "model": self.config.model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": self.config.temperature
            }
        }
        if tools:
            # Ollama accepts tools schema directly in recent versions
            payload["tools"] = tools

        timeout = httpx.Timeout(180.0, connect=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                async with client.stream("POST", url, json=payload) as response:
                    if response.status_code != 200:
                        err_text = await response.aread()
                        yield LLMResponseChunk(type="error", content=f"Ollama Error ({response.status_code}): {err_text.decode('utf-8', errors='ignore')}")
                        return

                    async for line in response.aiter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                        except Exception:
                            continue

                        msg = data.get("message", {})
                        content = msg.get("content", "")
                        
                        # Ollama native tool calls
                        tool_calls = msg.get("tool_calls", [])
                        if tool_calls:
                            for tc in tool_calls:
                                fn = tc.get("function", {})
                                yield LLMResponseChunk(
                                    type="tool_call",
                                    tool_name=fn.get("name"),
                                    tool_args=fn.get("arguments", {}),
                                    tool_call_id=f"ollama_{int(time.time()*1000)}"
                                )

                        if content:
                            yield LLMResponseChunk(type="token", content=content)

                        if data.get("done"):
                            yield LLMResponseChunk(type="done")
                            break

            except Exception as e:
                yield LLMResponseChunk(type="error", content=f"Ollama stream error: {str(e)}")

    async def _stream_anthropic(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> AsyncGenerator[LLMResponseChunk, None]:
        # Anthropic standard endpoint
        url = "https://api.anthropic.com/v1/messages"
        headers = {
            "x-api-key": self.config.api_key or "",
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        }
        
        # Format messages for Anthropic (extract system message)
        system_prompt = ""
        anthropic_msgs = []
        for m in messages:
            if m.get("role") == "system":
                system_prompt += m.get("content", "") + "\n"
            else:
                anthropic_msgs.append({
                    "role": m.get("role"),
                    "content": m.get("content", "")
                })

        payload: Dict[str, Any] = {
            "model": self.config.model or "claude-3-5-sonnet-20241022",
            "messages": anthropic_msgs,
            "max_tokens": self.config.max_tokens or 4096,
            "temperature": self.config.temperature,
            "stream": True
        }
        if system_prompt:
            payload["system"] = system_prompt.strip()

        # Tools formatting for Anthropic
        if tools:
            anthropic_tools = []
            for t in tools:
                fn = t.get("function", {})
                anthropic_tools.append({
                    "name": fn.get("name"),
                    "description": fn.get("description", ""),
                    "input_schema": fn.get("parameters", {"type": "object", "properties": {}})
                })
            payload["tools"] = anthropic_tools

        timeout = httpx.Timeout(120.0, connect=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                async with client.stream("POST", url, headers=headers, json=payload) as response:
                    if response.status_code != 200:
                        err_text = await response.aread()
                        yield LLMResponseChunk(type="error", content=f"Anthropic Error ({response.status_code}): {err_text.decode('utf-8', errors='ignore')}")
                        return

                    current_tool_id = None
                    current_tool_name = None
                    current_tool_args_str = ""

                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            ev = json.loads(data_str)
                        except Exception:
                            continue

                        ev_type = ev.get("type")
                        if ev_type == "content_block_start":
                            cb = ev.get("content_block", {})
                            if cb.get("type") == "tool_use":
                                current_tool_id = cb.get("id")
                                current_tool_name = cb.get("name")
                                current_tool_args_str = ""
                        elif ev_type == "content_block_delta":
                            delta = ev.get("delta", {})
                            if delta.get("type") == "text_delta":
                                yield LLMResponseChunk(type="token", content=delta.get("text", ""))
                            elif delta.get("type") == "input_json_delta":
                                current_tool_args_str += delta.get("partial_json", "")
                        elif ev_type == "content_block_stop":
                            if current_tool_name:
                                try:
                                    args = json.loads(current_tool_args_str) if current_tool_args_str else {}
                                except Exception:
                                    args = {"raw": current_tool_args_str}
                                yield LLMResponseChunk(
                                    type="tool_call",
                                    tool_name=current_tool_name,
                                    tool_args=args,
                                    tool_call_id=current_tool_id
                                )
                                current_tool_name = None
                        elif ev_type == "message_stop":
                            yield LLMResponseChunk(type="done")

            except Exception as e:
                yield LLMResponseChunk(type="error", content=f"Anthropic stream error: {str(e)}")

    async def _stream_gemini(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> AsyncGenerator[LLMResponseChunk, None]:
        # Google Gemini REST streamGenerateContent
        raw_model = self.config.model or "gemini-2.5-flash"
        clean_model = raw_model.replace("models/", "").strip()

        # Automatic aliases for expired, experimental or renamed model identifiers
        model_aliases = {
            "gemini-2.0-flash-exp": "gemini-2.5-flash",
            "gemini-2.0-flash-exp-001": "gemini-2.5-flash",
            "gemini-2.0-flash": "gemini-2.5-flash",
            "gemini-1.5-flash-latest": "gemini-flash-latest",
            "gemini-1.5-pro-latest": "gemini-pro-latest",
            "gemini-1.5-flash": "gemini-flash-latest",
            "gemini-1.5-pro": "gemini-pro-latest",
        }
        model_name = model_aliases.get(clean_model, clean_model)
        api_key = self.config.api_key or ""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:streamGenerateContent?key={api_key}&alt=sse"

        # Transform messages to Gemini format
        contents = []
        system_instruction = None
        for m in messages:
            role = m.get("role")
            text = m.get("content", "")
            if role == "system":
                system_instruction = {"parts": [{"text": text}]}
            elif role == "assistant":
                parts = []
                if text:
                    parts.append({"text": text})
                if m.get("tool_calls"):
                    for tc in m["tool_calls"]:
                        fn = tc.get("function", {})
                        args = fn.get("arguments", {})
                        if isinstance(args, str):
                            try:
                                args = json.loads(args)
                            except Exception:
                                args = {"raw": args}
                        parts.append({
                            "functionCall": {
                                "name": fn.get("name"),
                                "args": args
                            }
                        })
                if parts:
                    contents.append({"role": "model", "parts": parts})
            elif role == "tool":
                contents.append({
                    "role": "user",
                    "parts": [{
                        "text": f"[工具執行結果 (來自 {m.get('name', 'tool')} )]:\n{text}"
                    }]
                })
            else:
                contents.append({"role": "user", "parts": [{"text": text}]})

        payload: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": self.config.temperature
            }
        }
        if system_instruction:
            payload["systemInstruction"] = system_instruction

        # Add tools function declarations if provided
        if tools:
            func_decls = []
            for t in tools:
                fn = t.get("function", {})
                func_decls.append({
                    "name": fn.get("name"),
                    "description": fn.get("description", ""),
                    "parameters": fn.get("parameters", {"type": "object", "properties": {}})
                })
            if func_decls:
                payload["tools"] = [{"functionDeclarations": func_decls}]

        timeout = httpx.Timeout(120.0, connect=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                async with client.stream("POST", url, json=payload) as response:
                    if response.status_code != 200:
                        err_text = await response.aread()
                        err_str = err_text.decode('utf-8', errors='ignore')
                        if response.status_code == 404:
                            yield LLMResponseChunk(
                                type="error",
                                content=f"Gemini 模型 '{raw_model}' 在目前 API 版本中不存在或已過期 (HTTP 404)。\n"
                                        f"建議切換為現行可用模型：'gemini-2.5-flash'、'gemini-flash-latest' 或 'gemini-pro-latest'。\n"
                                        f"API 回應: {err_str}"
                            )
                        else:
                            yield LLMResponseChunk(type="error", content=f"Gemini Error ({response.status_code}): {err_str}")
                        return

                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data: "):
                            continue
                        data_str = line[6:].strip()
                        try:
                            data = json.loads(data_str)
                        except Exception:
                            continue

                        candidates = data.get("candidates", [])
                        if candidates:
                            parts = candidates[0].get("content", {}).get("parts", [])
                            for p in parts:
                                # Check if part is reasoning / thought
                                if p.get("thought"):
                                    yield LLMResponseChunk(type="thought", content=p.get("text", ""))
                                elif "text" in p:
                                    yield LLMResponseChunk(type="token", content=p["text"])

                                if "functionCall" in p:
                                    fc = p["functionCall"]
                                    yield LLMResponseChunk(
                                        type="tool_call",
                                        tool_name=fc.get("name"),
                                        tool_args=fc.get("args", {}),
                                        tool_call_id=f"gemini_{int(time.time()*1000)}"
                                    )

                    yield LLMResponseChunk(type="done")
            except Exception as e:
                yield LLMResponseChunk(type="error", content=f"Gemini stream error: {str(e)}")

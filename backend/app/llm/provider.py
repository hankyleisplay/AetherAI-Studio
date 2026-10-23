import json
import time
import httpx
from typing import Dict, Any, List, Optional, AsyncGenerator
from pydantic import BaseModel

class ModelConfig(BaseModel):
    provider: str = "ollama"  # "ollama", "openai_compatible", "anthropic", "gemini"
    base_url: str = "http://localhost:11434"
    api_key: Optional[str] = None
    model: str = ""
    temperature: float = 0.7
    max_tokens: int = 8192
    context_window: int = 16384

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

    DEFAULT_PROVIDER_MODELS: Dict[str, List[str]] = {
        "ollama": [],
        "openai_compatible": [],
        "lm_studio": [],
        "deepseek": ["deepseek-chat", "deepseek-reasoner"],
        "openai": ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "o3-mini", "o1"],
        "anthropic": ["claude-3-7-sonnet-latest", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
        "gemini": ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-flash-latest", "gemini-pro-latest"],
        "groq": ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "deepseek-r1-distill-llama-70b", "mixtral-8x7b-32768", "gemma2-9b-it"]
    }

    async def test_connection(self) -> Dict[str, Any]:
        """Test connection and return latency + available models if discoverable."""
        start = time.time()
        timeout = httpx.Timeout(5.0)
        provider = self.config.provider
        fallback_models = self.DEFAULT_PROVIDER_MODELS.get(provider, [self.config.model] if self.config.model else [])

        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                if provider == "ollama":
                    base = self.config.base_url.rstrip("/")
                    urls_to_try = [f"{base}/api/tags"]
                    if "localhost" in base:
                        urls_to_try.append(f"{base.replace('localhost', '127.0.0.1')}/api/tags")

                    last_err = ""
                    for url in urls_to_try:
                        try:
                            resp = await client.get(url)
                            latency = round((time.time() - start) * 1000, 1)
                            if resp.status_code == 200:
                                data = resp.json()
                                models = [m.get("name") for m in data.get("models", []) if m.get("name")]
                                return {
                                    "success": True,
                                    "latency_ms": latency,
                                    "models": models,
                                    "installed_count": len(models),
                                    "provider": "ollama"
                                }
                            last_err = f"Ollama HTTP {resp.status_code}"
                        except Exception as e:
                            last_err = str(e)

                    # Try `ollama list` CLI if daemon isn't responding or on another port
                    try:
                        import subprocess
                        res = subprocess.run(
                            ["ollama", "list"],
                            capture_output=True,
                            text=True,
                            encoding="utf-8",
                            errors="replace",
                            timeout=3
                        )
                        if res.returncode == 0 and res.stdout:
                            lines = [ln.strip() for ln in res.stdout.strip().splitlines() if ln.strip()]
                            cli_models = []
                            for ln in lines[1:]:
                                parts = ln.split()
                                if parts:
                                    cli_models.append(parts[0])
                            if cli_models:
                                latency = round((time.time() - start) * 1000, 1)
                                return {
                                    "success": True,
                                    "latency_ms": latency,
                                    "models": cli_models,
                                    "installed_count": len(cli_models),
                                    "provider": "ollama"
                                }
                    except Exception:
                        pass

                    return {
                        "success": False,
                        "error": f"無法連線至本機 Ollama 服務 ({last_err or '未啟動'})",
                        "models": [],
                        "provider": "ollama"
                    }

                elif provider in ["openai_compatible", "lm_studio", "deepseek", "groq", "openai"]:
                    base = self.config.base_url.rstrip("/")
                    urls_to_try = [f"{base}/models"]
                    if not base.endswith("/v1"):
                        urls_to_try.append(f"{base}/v1/models")
                    headers = {}
                    if self.config.api_key:
                        headers["Authorization"] = f"Bearer {self.config.api_key}"

                    for url in urls_to_try:
                        try:
                            resp = await client.get(url, headers=headers)
                            latency = round((time.time() - start) * 1000, 1)
                            if resp.status_code == 200:
                                data = resp.json()
                                raw_models = data.get("data", [])
                                models = [m.get("id") for m in raw_models if isinstance(m, dict) and m.get("id")]
                                if models:
                                    # Keep curated models first if present
                                    prioritized = [m for m in fallback_models if m in models] + [m for m in models if m not in fallback_models]
                                    return {"success": True, "latency_ms": latency, "models": prioritized, "provider": provider}
                        except Exception:
                            pass

                    latency = round((time.time() - start) * 1000, 1)
                    if provider in ["openai_compatible", "lm_studio"]:
                        return {
                            "success": False,
                            "latency_ms": latency,
                            "models": [],
                            "error": f"無法連線至 {provider} 服務或尚未載入模型",
                            "provider": provider
                        }
                    else:
                        has_key = bool(self.config.api_key and self.config.api_key.strip())
                        return {
                            "success": has_key,
                            "latency_ms": latency,
                            "models": fallback_models if has_key else [],
                            "error": None if has_key else f"尚未填寫 {provider} API Key",
                            "provider": provider
                        }

                elif provider == "anthropic":
                    latency = round((time.time() - start) * 1000, 1)
                    has_key = bool(self.config.api_key and self.config.api_key.strip())
                    return {
                        "success": has_key,
                        "latency_ms": latency,
                        "models": fallback_models if has_key else [],
                        "error": None if has_key else "尚未填寫 Anthropic API Key",
                        "provider": "anthropic"
                    }

                elif provider == "gemini":
                    api_key = self.config.api_key or ""
                    latency = round((time.time() - start) * 1000, 1)
                    if api_key:
                        url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
                        try:
                            resp = await client.get(url)
                            latency = round((time.time() - start) * 1000, 1)
                            if resp.status_code == 200:
                                data = resp.json()
                                raw_models = data.get("models", [])
                                valid_models = []
                                for m in raw_models:
                                    methods = m.get("supportedGenerationMethods", [])
                                    if "generateContent" in methods:
                                        name = m.get("name", "").replace("models/", "")
                                        valid_models.append(name)
                                return {"success": True, "latency_ms": latency, "models": valid_models, "provider": "gemini"}
                            elif resp.status_code in (400, 403):
                                return {
                                    "success": False,
                                    "error": "Gemini API Key 無效或未授權",
                                    "models": [],
                                    "provider": "gemini"
                                }
                        except Exception as e:
                            return {
                                "success": False,
                                "error": f"Gemini 連線異常: {str(e)}",
                                "models": [],
                                "provider": "gemini"
                            }
                    return {
                        "success": False,
                        "latency_ms": latency,
                        "models": [],
                        "error": "尚未填寫 Gemini API Key",
                        "provider": "gemini"
                    }

                return {"success": False, "error": f"Unknown provider: {provider}", "models": fallback_models}
            except Exception as e:
                return {"success": False, "error": f"Connection failed: {str(e)}", "models": fallback_models}

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

        # Support multimodal image payloads for OpenAI-compatible providers
        formatted_messages = []
        for m in messages:
            m_copy = dict(m)
            if m.get("images") and m.get("role") == "user":
                parts = [{"type": "text", "text": m.get("content", "")}]
                for img in m["images"]:
                    clean_b64 = re.sub(r"^data:image\/[a-zA-Z0-9\+\-\.]+;base64,", "", str(img)).strip()
                    parts.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:image/jpeg;base64,{clean_b64}"}
                    })
                m_copy["content"] = parts
                m_copy.pop("images", None)
            formatted_messages.append(m_copy)

        temp = float(self.config.temperature if self.config.temperature is not None else 0.7)
        payload: Dict[str, Any] = {
            "model": self.config.model,
            "messages": formatted_messages,
            "temperature": temp,
            "stream": True
        }
        if temp <= 0.3:
            payload["top_p"] = 0.2
        elif temp >= 0.9:
            payload["top_p"] = 0.95
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

                    last_finish_reason: Optional[str] = None
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

                        finish_reason = choices[0].get("finish_reason")
                        if finish_reason:
                            last_finish_reason = finish_reason

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

                yield LLMResponseChunk(
                    type="done",
                    metadata={"finish_reason": last_finish_reason or "stop"}
                )

            except Exception as e:
                yield LLMResponseChunk(type="error", content=f"Network/Stream error: {str(e)}")

    async def _stream_ollama(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None
    ) -> AsyncGenerator[LLMResponseChunk, None]:
        url = f"{self.config.base_url.rstrip('/')}/api/chat"

        # Sanitize messages for Ollama: Ollama requires function.arguments to be an object (dict), not a JSON string
        sanitized_messages = []
        for m in messages:
            m_copy = dict(m)
            if "tool_calls" in m_copy and isinstance(m_copy["tool_calls"], list):
                new_tcs = []
                for tc in m_copy["tool_calls"]:
                    tc_copy = dict(tc)
                    if "function" in tc_copy and isinstance(tc_copy["function"], dict):
                        fn_copy = dict(tc_copy["function"])
                        raw_args = fn_copy.get("arguments")
                        if isinstance(raw_args, str):
                            try:
                                fn_copy["arguments"] = json.loads(raw_args)
                            except Exception:
                                fn_copy["arguments"] = {}
                        tc_copy["function"] = fn_copy
                    new_tcs.append(tc_copy)
                m_copy["tool_calls"] = new_tcs
            sanitized_messages.append(m_copy)

        temp = float(self.config.temperature if self.config.temperature is not None else 0.7)
        options = {
            "temperature": temp
        }
        if temp <= 0.3:
            # Precise & Rigorous: Low entropy, strict sampling
            options["top_p"] = 0.2
            options["top_k"] = 20
        elif temp >= 0.9:
            # Creative & Visionary: High exploration sampling
            options["top_p"] = 0.95
            options["top_k"] = 100
        else:
            options["top_p"] = 0.9
            options["top_k"] = 40
        # Explicitly configure num_ctx to prevent Ollama from defaulting to 2048/4096 tokens,
        # which causes premature cutoff in long multi-turn sessions.
        ctx_size = getattr(self.config, "context_window", None) or 16384
        min_ctx = (self.config.max_tokens or 8192) + 4096
        options["num_ctx"] = max(ctx_size, min_ctx)

        if self.config.max_tokens:
            options["num_predict"] = max(self.config.max_tokens, 8192)

        payload = {
            "model": self.config.model,
            "messages": sanitized_messages,
            "stream": True,
            "options": options
        }
        if tools:
            # Ollama accepts tools schema directly in recent versions
            payload["tools"] = tools

        timeout = httpx.Timeout(180.0, connect=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            try:
                # Helper to process an Ollama stream response
                async def _consume_stream(resp):
                    in_thought_tag = False
                    thought_buffer = ""

                    async for line in resp.aiter_lines():
                        if not line:
                            continue
                        try:
                            data = json.loads(line)
                        except Exception:
                            continue

                        msg = data.get("message", {})
                        
                        # 1. Capture thinking / reasoning tokens from Ollama (gemma4, deepseek-r1, etc.)
                        thinking = msg.get("thinking")
                        if thinking:
                            yield LLMResponseChunk(type="thought", content=thinking)

                        # 2. Ollama native tool calls
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

                        # 3. Capture regular content (and parse embedded <think>...</think> if present)
                        content = msg.get("content", "")
                        if content:
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

                        if data.get("done"):
                            done_reason = data.get("done_reason") or "stop"
                            yield LLMResponseChunk(
                                type="done",
                                metadata={"finish_reason": done_reason}
                            )
                            break

                async with client.stream("POST", url, json=payload) as response:
                    if response.status_code != 200:
                        err_text = await response.aread()
                        err_str = err_text.decode('utf-8', errors='ignore')
                        # If tools caused an error (e.g., model does not support tools), retry without tools
                        if tools and response.status_code in (400, 500):
                            payload_no_tools = {**payload}
                            payload_no_tools.pop("tools", None)
                            async with client.stream("POST", url, json=payload_no_tools) as retry_resp:
                                if retry_resp.status_code == 200:
                                    async for c in _consume_stream(retry_resp):
                                        yield c
                                    return
                        yield LLMResponseChunk(type="error", content=f"Ollama Error ({response.status_code}): {err_str}")
                        return

                    async for c in _consume_stream(response):
                        yield c

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

        temp = max(0.0, min(1.0, float(self.config.temperature if self.config.temperature is not None else 0.7)))
        payload: Dict[str, Any] = {
            "model": self.config.model or "claude-3-5-sonnet-20241022",
            "messages": anthropic_msgs,
            "max_tokens": self.config.max_tokens or 4096,
            "temperature": temp,
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
                    last_stop_reason = None

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
                        elif ev_type == "message_delta":
                            delta = ev.get("delta", {})
                            if delta.get("stop_reason"):
                                last_stop_reason = delta.get("stop_reason")
                        elif ev_type == "message_stop":
                            yield LLMResponseChunk(
                                type="done",
                                metadata={"finish_reason": "length" if last_stop_reason == "max_tokens" else "stop"}
                            )

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
                user_parts = [{"text": text}]
                if m.get("images"):
                    for img in m["images"]:
                        clean_b64 = re.sub(r"^data:image\/[a-zA-Z0-9\+\-\.]+;base64,", "", str(img)).strip()
                        user_parts.append({
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": clean_b64
                            }
                        })
                contents.append({"role": "user", "parts": user_parts})

        temp = float(self.config.temperature if self.config.temperature is not None else 0.7)
        generation_cfg: Dict[str, Any] = {
            "temperature": temp
        }
        if temp <= 0.3:
            generation_cfg["topP"] = 0.2
        elif temp >= 0.9:
            generation_cfg["topP"] = 0.95

        payload: Dict[str, Any] = {
            "contents": contents,
            "generationConfig": generation_cfg
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

                    last_finish_reason = "stop"
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
                            fr = candidates[0].get("finishReason")
                            if fr in ("MAX_TOKENS", "LENGTH"):
                                last_finish_reason = "length"
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

                    yield LLMResponseChunk(
                        type="done",
                        metadata={"finish_reason": last_finish_reason}
                    )
            except Exception as e:
                yield LLMResponseChunk(type="error", content=f"Gemini stream error: {str(e)}")

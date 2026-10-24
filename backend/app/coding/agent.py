"""
Autonomous coding agent loop for Code mode.

Differences from the chat orchestrator, and why:
- Full transcript per session (assistant tool calls + tool results), so the next user message continues the
  work instead of starting over with only the visible text.
- Dedicated coding toolset (search / ranged read / exact edit / shell / todos) instead of 22 general tools.
- Up to MAX_STEPS tool rounds per turn, ending when the model answers without calling a tool.
- Context budget management: old tool outputs are trimmed, then oldest turns dropped, before each LLM call.
- Accept Edit mode is a real gate: mutating tools pause until the user approves or rejects in the UI.
- Repeated identical tool calls are flagged so small local models don't loop forever.
"""
import asyncio
import json
import platform
import re
import subprocess
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

from backend.app.coding.tools import CodingToolset, ToolResult, truncate_middle
from backend.app.config import get_effective_workspace_dir
from backend.app.llm.provider import ModelConfig, UnifiedLLMClient
from backend.app.storage.database import db

MAX_STEPS = 50
APPROVAL_TIMEOUT_S = 30 * 60
KEEP_RECENT_TOOL_OUTPUTS = 6
PROJECT_INSTRUCTION_FILES = ("AGENTS.md", "CLAUDE.md", ".aether.md", "AETHER.md")

# Pending approvals and stop requests, shared with the HTTP endpoints
_pending_approvals: Dict[str, asyncio.Future] = {}
_approval_sessions: Dict[str, str] = {}
_stop_flags: Dict[str, asyncio.Event] = {}


def resolve_approval(request_id: str, approved: bool, feedback: str = "") -> bool:
    fut = _pending_approvals.get(request_id)
    if not fut or fut.done():
        return False
    fut.set_result({"approved": approved, "feedback": feedback})
    return True


def request_stop(session_id: str) -> bool:
    ev = _stop_flags.get(session_id)
    if not ev:
        return False
    ev.set()
    # Unblock an approval wait so the loop can notice the stop
    for rid, sid in list(_approval_sessions.items()):
        if sid == session_id:
            resolve_approval(rid, False, "stopped")
    return True


TEXT = {
    "zh-TW": {"lang": "Reply in the language the user writes in; default to Traditional Chinese (繁體中文).",
              "max_steps": "\n\n> ⚠️ 已達單回合最多 {n} 個步驟，任務暫停。輸入「繼續」即可接著完成。",
              "stopped": "\n\n> ⏹️ 已依你的要求停止。",
              "rejected": "使用者拒絕了這個操作。",
              "empty": "（模型沒有產生回覆。）"},
    "zh-CN": {"lang": "Reply in the language the user writes in; default to Simplified Chinese (简体中文).",
              "max_steps": "\n\n> ⚠️ 已达单回合最多 {n} 个步骤，任务暂停。输入「继续」即可接着完成。",
              "stopped": "\n\n> ⏹️ 已按你的要求停止。",
              "rejected": "用户拒绝了这个操作。",
              "empty": "（模型没有产生回复。）"},
    "en": {"lang": "Reply in the language the user writes in; default to English.",
           "max_steps": "\n\n> ⚠️ Reached the limit of {n} steps for one turn. Say \"continue\" to keep going.",
           "stopped": "\n\n> ⏹️ Stopped as requested.",
           "rejected": "The user rejected this action.",
           "empty": "(The model returned no response.)"},
    "ja": {"lang": "Reply in the language the user writes in; default to Japanese (日本語).",
           "max_steps": "\n\n> ⚠️ 1 ターンの上限 {n} ステップに達したため一時停止しました。「続けて」と入力すると再開します。",
           "stopped": "\n\n> ⏹️ 指示により停止しました。",
           "rejected": "ユーザーがこの操作を拒否しました。",
           "empty": "（モデルは応答を返しませんでした。）"},
}

MODE_GUIDANCE = {
    "auto": "You are running autonomously: make the changes, run the commands and tests yourself, and keep going until "
            "the task is done. Only stop to ask the user when a decision genuinely needs them.",
    "accept_edit": "Every file change and command you request is shown to the user for approval before it runs. "
                   "If an action is rejected, do not retry it unchanged: adjust your approach or ask what they want.",
    "turbo": "Turbo mode: minimise narration. Skip the todo list for small tasks, make the change directly, verify it, "
             "and finish with a two-line summary.",
}


class CodingAgent:
    def __init__(self, config: ModelConfig, session_id: str, project: Optional[str] = None,
                 execution_mode: str = "auto", language: str = "zh-TW"):
        self.config = config
        self.client = UnifiedLLMClient(config)
        self.session_id = session_id
        self.root = get_effective_workspace_dir(project)
        self.project = project
        self.mode = execution_mode if execution_mode in MODE_GUIDANCE else "auto"
        self.language = language if language in TEXT else "zh-TW"
        self.text = TEXT[self.language]

        saved = db.get_agent_session(session_id) or {}
        # A different project root means a different codebase: start a fresh transcript
        if saved.get("root") and saved.get("root") != str(self.root):
            saved = {}
        self.transcript: List[Dict[str, Any]] = saved.get("messages", [])
        self.state: Dict[str, Any] = saved.get("state", {})
        self.tools = CodingToolset(self.root, self.state)

    # ------------------------------------------------------------ persistence
    def _prune_deleted_turns(self):
        """Drop turns whose user message was deleted in the UI (edit / regenerate)."""
        existing = {m["id"] for m in db.get_messages(self.session_id)}
        kept: List[Dict[str, Any]] = []
        keep_turn = True
        for m in self.transcript:
            if m.get("role") == "user":
                keep_turn = m.get("_msg_id") in existing
            if keep_turn:
                kept.append(m)
        self.transcript = kept

    def _save(self):
        db.save_agent_session(self.session_id, {
            "root": str(self.root), "messages": self.transcript, "state": self.state,
        })

    # ------------------------------------------------------------ prompt
    def _environment(self) -> str:
        shell = "PowerShell" if platform.system() == "Windows" else "bash"
        lines = [
            f"- Project root: {self.root}",
            f"- OS: {platform.system()} {platform.release()} | Shell for run_command: {shell}",
            f"- Date: {datetime.now().strftime('%Y-%m-%d')}",
        ]
        try:
            res = subprocess.run(["git", "status", "--short", "--branch"], cwd=str(self.root), capture_output=True,
                                 timeout=5, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            if res.returncode == 0:
                st = res.stdout.decode("utf-8", errors="replace").strip().splitlines()
                lines.append(f"- Git: {st[0] if st else ''}; {max(0, len(st) - 1)} changed file(s)")
            else:
                lines.append("- Git: not a repository")
        except Exception:
            pass
        tree = self.tools.execute("list_dir", {"path": ".", "depth": 1}).output
        return "\n".join(lines) + "\n\nTop-level contents:\n" + truncate_middle(tree, 3000)

    def _project_instructions(self) -> str:
        for name in PROJECT_INSTRUCTION_FILES:
            p = self.root / name
            if p.is_file():
                try:
                    body = p.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue
                return f"\n\n# Project instructions ({name})\n{truncate_middle(body, 6000)}"
        return ""

    def _system_prompt(self) -> str:
        return f"""You are Aether Code, an autonomous software engineering agent working directly in the user's project through tools.

# How to work
1. Understand before changing: use glob / grep / list_dir to locate the relevant code, then read_file the parts you need. Never guess file contents or APIs.
2. For tasks with several steps, call todo_write with a short plan first and keep it updated as you go.
3. Make focused changes with edit_file (exact string replacement). Use write_file only for new files or full rewrites. Match the surrounding code style.
4. Verify your work: run the project's tests, build, linter or the script itself with run_command. If something fails, read the error, fix the cause and run it again.
5. Keep going until the task is complete. When you are done, reply WITHOUT calling a tool: summarise what changed (files and why) and how you verified it. Be concise.

# Rules
- All paths are relative to the project root. Stay inside it.
- Read a file before editing it. If an edit fails, re-read the file and copy the exact text.
- Never print entire files back to the user; refer to file paths and lines instead.
- Do not start servers or interactive programs with run_command; they would block until timeout.
- Don't run destructive commands (deleting data, force-pushing, resetting git history) unless the user explicitly asked.
- If a tool call keeps failing the same way, change approach instead of repeating it.
- {MODE_GUIDANCE[self.mode]}
- {self.text['lang']}

# Environment
{self._environment()}{self._project_instructions()}"""

    # ------------------------------------------------------------ context budget
    def _budget_chars(self) -> int:
        ctx = self.config.context_window or 16384
        if self.config.provider != "ollama":
            ctx = max(ctx, 100_000)
        reserve = min(self.config.max_tokens or 4096, int(ctx * 0.4))
        # ~3 characters per token is a conservative average for mixed code / CJK text
        return max(8000, (ctx - reserve) * 3)

    @staticmethod
    def _size(msgs: List[Dict[str, Any]]) -> int:
        return sum(len(m.get("content") or "") + len(json.dumps(m.get("tool_calls") or [])) for m in msgs)

    def _fit_context(self, system: str, msgs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        budget = self._budget_chars() - len(system)
        msgs = [dict(m) for m in msgs]
        if self._size(msgs) <= budget:
            return msgs
        # 1) Trim old tool outputs, keeping the most recent ones intact
        tool_idx = [i for i, m in enumerate(msgs) if m.get("role") == "tool"]
        for i in tool_idx[:-KEEP_RECENT_TOOL_OUTPUTS]:
            c = msgs[i].get("content") or ""
            if len(c) > 300:
                msgs[i]["content"] = c[:300] + "\n[older output trimmed to save context]"
        if self._size(msgs) <= budget:
            return msgs
        # 2) Drop the oldest whole turns (a turn starts at a user message), keep at least the current one
        user_idx = [i for i, m in enumerate(msgs) if m.get("role") == "user"]
        while len(user_idx) > 1 and self._size(msgs) > budget:
            cut = user_idx[1]
            msgs = [{"role": "user", "content": "[Earlier conversation omitted to fit the context window.]"},
                    {"role": "assistant", "content": "Understood."}] + msgs[cut:]
            user_idx = [i for i, m in enumerate(msgs) if m.get("role") == "user"][1:]
            if user_idx and user_idx[0] != 0:
                user_idx = [0] + user_idx
        if self._size(msgs) <= budget:
            return msgs
        # 3) Still too big within the current turn: trim every tool output except the last two
        tool_idx = [i for i, m in enumerate(msgs) if m.get("role") == "tool"]
        for i in tool_idx[:-2]:
            c = msgs[i].get("content") or ""
            if len(c) > 200:
                msgs[i]["content"] = c[:200] + "\n[trimmed]"
        return msgs

    @staticmethod
    def _for_llm(msgs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Strip internal keys and give every tool call a result: a turn stopped mid-batch leaves calls
        without one, and OpenAI-style APIs reject such a history."""
        out: List[Dict[str, Any]] = []
        pending: List[Dict[str, Any]] = []

        def flush():
            for call in pending:
                out.append({"role": "tool", "tool_call_id": call["id"],
                            "name": call.get("function", {}).get("name", ""), "content": "[not executed: interrupted]"})
            pending.clear()

        for m in msgs:
            clean = {k: v for k, v in m.items() if not k.startswith("_")}
            if clean.get("role") == "tool":
                pending[:] = [c for c in pending if c["id"] != clean.get("tool_call_id")]
            else:
                flush()
            out.append(clean)
            if clean.get("role") == "assistant" and clean.get("tool_calls"):
                pending = list(clean["tool_calls"])
        flush()
        return out

    # ------------------------------------------------------------ text tool-call fallback
    _TOOL_BLOCK = re.compile(r"<tool_call>\s*(\{.*?\})\s*</tool_call>|```(?:json|tool)?\s*(\{[^`]*?\"name\"[^`]*?\})\s*```", re.S)

    def _parse_text_tool_calls(self, text: str) -> List[Dict[str, Any]]:
        """For models without native tool calling: <tool_call>{...}</tool_call> or a fenced JSON block."""
        calls = []
        for m in self._TOOL_BLOCK.finditer(text or ""):
            raw = m.group(1) or m.group(2)
            try:
                obj = json.loads(raw)
            except Exception:
                continue
            name = obj.get("name") or obj.get("tool")
            args = obj.get("arguments") or obj.get("args") or obj.get("parameters") or {}
            if isinstance(args, str):
                try:
                    args = json.loads(args)
                except Exception:
                    args = {}
            if name in self.tools.specs:
                calls.append({"id": f"text_{uuid.uuid4().hex[:10]}", "name": name, "args": args})
        return calls

    # ------------------------------------------------------------ main loop
    async def run_stream(self, user_prompt: str, user_message_id: Optional[str] = None,
                         assistant_message_id: Optional[str] = None,
                         images: Optional[List[str]] = None) -> AsyncGenerator[Dict[str, Any], None]:
        user_msg = db.add_message(session_id=self.session_id, role="user", content=user_prompt,
                                  msg_id=user_message_id, images=images or [])
        yield {"type": "session_info", "session_id": self.session_id, "user_message_id": user_msg["id"],
               "assistant_message_id": assistant_message_id}

        self._prune_deleted_turns()
        turn_user: Dict[str, Any] = {"role": "user", "content": user_prompt, "_msg_id": user_msg["id"]}
        if images:
            turn_user["images"] = [re.sub(r"^data:image/[\w.+-]+;base64,", "", i) for i in images if i]
        self.transcript.append(turn_user)

        stop = asyncio.Event()
        _stop_flags[self.session_id] = stop
        visible_text = ""
        thought_text = ""
        tool_records: List[Dict[str, Any]] = []
        recent_calls: List[str] = []
        ended_by = "answer"

        if self.state.get("todos"):
            yield {"type": "todos", "todos": self.state["todos"]}
        yield {"type": "status", "stage": "thinking", "text": "正在分析專案...", "key": "code_status_analyzing"}

        try:
            system = self._system_prompt()
            for step in range(1, MAX_STEPS + 1):
                if stop.is_set():
                    ended_by = "stopped"
                    break
                messages = [{"role": "system", "content": system}] + self._for_llm(self._fit_context(system, self.transcript))

                step_text, step_calls, error = "", [], None
                if visible_text and not visible_text.endswith("\n\n"):
                    sep = "\n\n"
                    visible_text += sep
                    yield {"type": "token", "content": sep}
                async for chunk in self.client.stream_chat(messages, tools=self.tools.schemas()):
                    if stop.is_set():
                        break
                    if chunk.type == "token" and chunk.content:
                        if not step_text:
                            yield {"type": "status", "stage": "generating", "text": "", "key": ""}
                        step_text += chunk.content
                        visible_text += chunk.content
                        yield {"type": "token", "content": chunk.content}
                    elif chunk.type == "thought" and chunk.content:
                        thought_text += chunk.content
                        yield {"type": "thought", "content": chunk.content}
                    elif chunk.type == "tool_call" and chunk.tool_name:
                        step_calls.append({"id": chunk.tool_call_id or f"call_{uuid.uuid4().hex[:10]}",
                                           "name": chunk.tool_name, "args": chunk.tool_args or {}})
                    elif chunk.type == "error":
                        error = chunk.content
                        break

                if error:
                    yield {"type": "error", "error": error}
                    ended_by = "error"
                    break
                if stop.is_set():
                    ended_by = "stopped"
                    break
                if not step_calls:
                    step_calls = self._parse_text_tool_calls(step_text)

                self.transcript.append({
                    "role": "assistant",
                    "content": step_text,
                    **({"tool_calls": [{"id": c["id"], "type": "function",
                                        "function": {"name": c["name"], "arguments": json.dumps(c["args"], ensure_ascii=False)}}
                                       for c in step_calls]} if step_calls else {}),
                })
                if not step_calls:
                    break  # final answer

                for call in step_calls:
                    holder: Dict[str, Any] = {}
                    async for ev in self._run_tool(call, recent_calls, holder):
                        yield ev
                    tool_records.append(holder["record"])
                    if call["name"] == "todo_write" and holder["record"]["success"]:
                        yield {"type": "todos", "todos": self.state.get("todos", [])}
                    if stop.is_set():
                        break
                self._save()
            else:
                ended_by = "max_steps"
        except asyncio.CancelledError:
            # Client disconnected: keep what we have so the next turn can continue
            self._save()
            raise
        finally:
            _stop_flags.pop(self.session_id, None)

        notice = ""
        if ended_by == "max_steps":
            notice = self.text["max_steps"].format(n=MAX_STEPS)
        elif ended_by == "stopped":
            notice = self.text["stopped"]
        if notice:
            visible_text += notice
            yield {"type": "token", "content": notice}
        self._save()

        if not visible_text.strip() and not tool_records:
            visible_text = self.text["empty"]
        saved = db.add_message(session_id=self.session_id, role="assistant", content=visible_text,
                               thought=thought_text, tool_calls=tool_records, msg_id=assistant_message_id)
        yield {"type": "done", "message_id": saved["id"], "session_id": self.session_id,
               "executed_tools": len(tool_records), "content": visible_text, "thought": thought_text}

    async def _run_tool(self, call: Dict[str, Any], recent_calls: List[str],
                        out: Dict[str, Any]) -> AsyncGenerator[Dict[str, Any], None]:
        """Execute one tool call, yielding UI events as they happen (incl. the approval request before
        blocking on it). The UI record for the saved message is returned through `out["record"]`."""
        name, args, call_id = call["name"], call["args"], call["id"]
        yield {"type": "tool_start", "id": call_id, "name": name, "args": args}
        spec = self.tools.specs.get(name)
        start = time.time()

        approved, feedback = True, ""
        if spec and spec.mutating and self.mode == "accept_edit":
            request_id = uuid.uuid4().hex
            fut = asyncio.get_running_loop().create_future()
            _pending_approvals[request_id] = fut
            _approval_sessions[request_id] = self.session_id
            yield {"type": "approval_request", "request_id": request_id, "tool_id": call_id,
                   "name": name, "args": args, "preview": self._preview(name, args)}
            try:
                decision = await asyncio.wait_for(fut, timeout=APPROVAL_TIMEOUT_S)
            except asyncio.TimeoutError:
                decision = {"approved": False, "feedback": "approval timed out"}
            finally:
                _pending_approvals.pop(request_id, None)
                _approval_sessions.pop(request_id, None)
            approved, feedback = decision["approved"], decision.get("feedback", "")
            yield {"type": "approval_resolved", "request_id": request_id, "tool_id": call_id, "approved": approved}

        if not approved:
            extra = f" {feedback}" if feedback and feedback != "stopped" else ""
            result = ToolResult(False, self.text["rejected"] + extra)
        else:
            result = await asyncio.to_thread(self.tools.execute, name, args)

        key = name + json.dumps(args, sort_keys=True, ensure_ascii=False)
        recent_calls.append(key)
        output_for_model = truncate_middle(result.output)
        if recent_calls[-3:] == [key] * 3:
            output_for_model += ("\n\n[Note: you have made this exact call three times in a row. "
                                 "It is not working; try a different approach or explain the blocker to the user.]")
        self.transcript.append({"role": "tool", "tool_call_id": call_id, "name": name, "content": output_for_model})

        record = {"id": call_id, "name": name, "args": args, "output": truncate_middle(result.output, 6000),
                  "success": result.ok, "duration": round(time.time() - start, 2), "display": result.display}
        out["record"] = record
        yield {"type": "tool_result", **record}

    def _preview(self, name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """What the user sees on the approval card."""
        if name == "run_command":
            return {"kind": "command", "command": args.get("command", ""), "cwd": args.get("cwd", ".")}
        path = args.get("path") or args.get("file_path") or ""
        try:
            p = self.tools._resolve(path)
            rel = self.tools._rel(p)
            old = p.read_text(encoding="utf-8", errors="replace").replace("\r\n", "\n") if p.is_file() else ""
        except Exception:
            rel, old = path, ""
        if name == "edit_file":
            o, n = args.get("old_string", ""), args.get("new_string", "")
            new = old.replace(o, n) if args.get("replace_all") else old.replace(o, n, 1)
        else:
            new = (args.get("content") or "").replace("\r\n", "\n")
        return {"kind": "diff", "path": rel, "diff": self.tools._diff(old, new, rel), "created": not old}

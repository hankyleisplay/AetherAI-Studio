import os

import sys

from pathlib import Path



if os.name == "nt":

    try:

        if hasattr(sys.stdout, "reconfigure"):

            sys.stdout.reconfigure(encoding="utf-8", errors="replace")

        if hasattr(sys.stderr, "reconfigure"):

            sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    except Exception:

        pass



PROJECT_ROOT = Path(__file__).resolve().parent

SITE_PACKAGES = PROJECT_ROOT / "backend" / "site-packages"

if str(PROJECT_ROOT) not in sys.path:

    sys.path.insert(0, str(PROJECT_ROOT))

if SITE_PACKAGES.exists() and str(SITE_PACKAGES) not in sys.path:

    sys.path.insert(0, str(SITE_PACKAGES))



import asyncio

import httpx

from backend.app.main import app

from backend.app.storage.database import db





async def run_tests():

    prev_tg_cfg = db.get_setting("telegram_config")

    transport = httpx.ASGITransport(app=app)

    sess = None
    try:

        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:

            # 1. Health check

            res = await client.get("/api/health")

            print("1. /api/health:", res.status_code, res.json())

            assert res.status_code == 200

            assert "Aether AI Studio 3.7.3 (AetherAgent)" in res.json()["app"]

            assert res.json()["version"] == "3.7.3"



            # 2. Get active model & test auto-discovery + model switching

            res = await client.get("/api/models/active")

            active_cfg = res.json()

            print("2. /api/models/active:", res.status_code, active_cfg)

            assert res.status_code == 200



            probe_res = await client.post("/api/models/test", json=active_cfg)

            probe_data = probe_res.json()

            print("2b. /api/models/test models:", probe_res.status_code, len(probe_data.get("models", [])), probe_data.get("models", [])[:3])

            assert probe_res.status_code == 200

            assert isinstance(probe_data.get("models"), list)
            if probe_data.get("models"):
                # Test switching model and restoring
                switched_cfg = {**active_cfg, "model": probe_data["models"][-1]}
                save_res = await client.post("/api/models/active", json=switched_cfg)
                assert save_res.status_code == 200
                verify_res = await client.get("/api/models/active")
                assert verify_res.json()["model"] == probe_data["models"][-1]
                await client.post("/api/models/active", json=active_cfg)
            else:
                assert probe_data.get("models") == []



            # 3. List tools

            res = await client.get("/api/tools")

            tools = res.json()

            print("3. /api/tools count:", len(tools), [t["name"] for t in tools])

            assert len(tools) >= 22



            # 3b. Verify web_search execution directly

            from backend.app.tools.registry import registry

            search_res = await registry.execute("web_search", {"query": "Python programming", "max_results": 2})

            print("3b. web_search execution:", search_res["success"], "Results found:", "URL:" in str(search_res.get("output", "")))

            assert search_res["success"] is True

            assert "URL:" in search_res["output"]



            # 3c. Verify new enterprise tools execution

            hash_res = await registry.execute("hash_crypto_inspector", {

                "action": "hash_text",

                "text": "AetherAI-Studio",

                "algorithm": "sha256"

            })

            print("3c. hash_crypto_inspector:", hash_res["success"], "Digest output:", "雜湊值" in str(hash_res.get("output", "")))

            assert hash_res["success"] is True

            assert "雜湊值" in str(hash_res["output"])



            regex_res = await registry.execute("regex_pattern_matcher", {

                "action": "find_all",

                "pattern": r"(\w+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})",

                "text": "Contact us at support@aetherai.io or team@domain.org"

            })

            print("3d. regex_pattern_matcher:", regex_res["success"], "Matches found:", "2 處匹配" in str(regex_res.get("output", "")))

            assert regex_res["success"] is True

            assert "2 處匹配" in str(regex_res["output"])



            transformer_res = await registry.execute("data_transformer_converter", {

                "action": "json_to_yaml",

                "input_data": '{"name": "Aether", "version": 3}'

            })

            print("3e. data_transformer_converter:", transformer_res["success"], "Converted:", "version: 3" in str(transformer_res.get("output", "")))

            assert transformer_res["success"] is True

            assert "version: 3" in str(transformer_res["output"])



            # 3f. Test tool toggle API and interception

            toggle_off_res = await client.post("/api/tools/bash_executor/toggle", json={"enabled": False})

            assert toggle_off_res.status_code == 200

            assert toggle_off_res.json()["enabled"] is False



            # 3g. Verify registry execution intercept when disabled

            intercept_res = await registry.execute("bash_executor", {"command": "echo test"})

            print("3g. Disabled tool intercept:", intercept_res["success"] is False, "Reason:", intercept_res.get("output", "")[:40])

            assert intercept_res["success"] is False

            assert "【工具停用攔截】" in intercept_res["output"]



            # 3h. Verify prompt generator injects strict prohibition directive

            from backend.app.agent.core import AgentOrchestrator

            from backend.app.llm.provider import ModelConfig

            test_orch = AgentOrchestrator(ModelConfig())

            sys_prompt = test_orch._get_system_prompt()

            print("3h. System prompt strict prohibition directive check:", "### ⛔ 嚴格禁止與已停用工具清單" in sys_prompt)

            assert "### ⛔ 嚴格禁止與已停用工具清單" in sys_prompt

            assert "bash_executor" in sys_prompt



            # 3i. Test batch toggle API

            batch_on_res = await client.post("/api/tools/batch/toggle-all", json={"enabled": True})

            assert batch_on_res.status_code == 200

            assert batch_on_res.json()["success"] is True

            assert registry._definitions["bash_executor"].enabled is True

            print("3i. Batch toggle re-enabled all tools successfully!")



            # 3j. Verify interactive spoiler guideline in system prompt

            new_sys_prompt = test_orch._get_system_prompt()

            assert "🎭 互動趣味防雷與劇透/暴雷標籤支援" in new_sys_prompt

            print("3j. Interactive spoiler & easter egg guideline verified in system prompt!")



            # 3k. Verify temperature calibration & cognitive directives

            precise_orch = AgentOrchestrator(ModelConfig(temperature=0.2))

            precise_prompt = precise_orch._get_system_prompt()

            assert "🎯 認知與推論調優指令：【精確嚴謹模式 (Precise & Rigorous)】" in precise_prompt

            assert "零假設" in precise_prompt



            creative_orch = AgentOrchestrator(ModelConfig(temperature=1.1))

            creative_prompt = creative_orch._get_system_prompt()

            assert "🎨 認知與推論調優指令：【發散創意模式 (Creative & Visionary)】" in creative_prompt

            assert "打破常規框架" in creative_prompt



            balanced_orch = AgentOrchestrator(ModelConfig(temperature=0.7))

            balanced_prompt = balanced_orch._get_system_prompt()

            assert "⚖️ 認知與推論調優指令：【標準平衡模式 (Balanced)】" in balanced_prompt

            print("3k. Dynamic temperature calibration & cognitive directives verified successfully!")



            # 3l. Test Prompt Enhancer API (3.5 Preview)

            enh_res = await client.post("/api/prompt/enhance", json={"prompt": "編寫一個貪吃蛇遊戲", "temperature": 0.2})

            assert enh_res.status_code == 200

            assert "🎯 精確嚴謹模式" in enh_res.json()["enhanced_prompt"]



            enh_creative = await client.post("/api/prompt/enhance", json={"prompt": "設計一個魔幻時鐘", "temperature": 1.1})

            assert enh_creative.status_code == 200

            assert "🎨 發散創意模式" in enh_creative.json()["enhanced_prompt"]

            print("3l. AI Prompt Enhancer API verified across temperature modes!")



            # 4. List personas & Test custom persona creation and deletion

            res = await client.get("/api/personas")

            personas = res.json()

            print("4. /api/personas count:", len(personas), [p["name"] for p in personas])

            assert len(personas) >= 4



            # 4b. Test create and delete custom persona

            create_p_res = await client.post("/api/personas", json={

                "id": "custom_test_p",

                "name": "測試自訂角色",

                "description": "測試用角色",

                "icon": "Bot",

                "system_prompt": "你是一個測試角色",

                "enabled_tools": ["web_search"]

            })

            assert create_p_res.status_code == 200



            del_p_res = await client.delete("/api/personas/custom_test_p")

            assert del_p_res.status_code == 200

            assert del_p_res.json()["success"] is True



            # 4c. Verify protected built-in persona deletion fails

            del_builtin = await client.delete("/api/personas/assistant")

            assert del_builtin.status_code == 400

            print("4b. Custom persona creation & safe deletion verified successfully!")



            # 5. Create and get session

            res = await client.post("/api/sessions", json={"title": "測試會話", "persona_id": "assistant"})

            sess = res.json()

            print("5. Created session:", sess["id"], sess["title"])

            assert sess["title"] == "測試會話"



            # 6. Test session export

            export_res = await client.get(f"/api/sessions/{sess['id']}/export")

            print("6. Export session status:", export_res.status_code, "Length:", len(export_res.text))

            assert export_res.status_code == 200



            # 7. Telegram Bridge Status

            tg_res = await client.get("/api/telegram/status")

            print("7. Telegram status:", tg_res.status_code, tg_res.json())

            assert tg_res.status_code == 200

            assert "enabled" in tg_res.json()



            # 8. Telegram Config Save & Blank Token Preservation

            tg_cfg_res = await client.post(

                "/api/telegram/config",

                json={"token": "123456:FAKE_TOKEN_FOR_TEST", "chat_id": "12345678", "enabled": False}

            )

            print("8. Telegram save config:", tg_cfg_res.status_code, tg_cfg_res.json())

            assert tg_cfg_res.status_code == 200

            assert tg_cfg_res.json()["bridge"]["has_token"] is True



            tg_cfg_res2 = await client.post(

                "/api/telegram/config",

                json={"token": "", "chat_id": "12345678", "enabled": False}

            )

            assert tg_cfg_res2.status_code == 200

            assert tg_cfg_res2.json()["bridge"]["has_token"] is True



            # 9. Workspace file listing & security check

            ws_res = await client.get("/api/workspace/files")

            ws_files = ws_res.json()

            print("9. Workspace files status:", ws_res.status_code, "Count:", len(ws_files))

            assert ws_res.status_code == 200

            assert isinstance(ws_files, list)

            for f in ws_files:

                assert "\\" not in f["path"]



            # 10. Verify SPA index.html serving

            res = await client.get("/")

            print("10. SPA / index.html status:", res.status_code, "Length:", len(res.text))

            assert res.status_code == 200

            assert "Aether AI Studio 3.7.3" in res.text



            # 11. Verify token truncation notice is appended at the very end (never before headers)

            from backend.app.llm.provider import LLMResponseChunk, ModelConfig

            from backend.app.agent.core import AgentOrchestrator



            class MockTruncatedClient:

                def __init__(self, config):

                    self.config = config

                async def stream_chat(self, messages, tools=None):

                    yield LLMResponseChunk(type="token", content="## 🐍 貪吃蛇遊戲最終總結與交付\n完成所有邏輯。")

                    yield LLMResponseChunk(type="done", metadata={"finish_reason": "length"})



            orch = AgentOrchestrator(ModelConfig())

            orch.client = MockTruncatedClient(orch.config)

            stream_tokens = []

            async for ev in orch.run_stream(session_id=sess["id"], user_prompt="請幫我完成貪吃蛇遊戲"):

                if ev.get("type") == "token":

                    stream_tokens.append(ev.get("content", ""))

            

            full_delivered = "".join(stream_tokens)

            print("11. Truncation placement test full delivery length:", len(full_delivered))

            assert full_delivered.startswith("## 🐍 貪吃蛇遊戲最終總結與交付"), "Header must not have notice injected in front!"

            assert "⚠️ **提示**：模型生成已達本次最大長度上限" in full_delivered

            assert full_delivered.strip().endswith("請輸入「請繼續」。"), "Notice must be placed at the very end!"

            print("11b. Truncation placement verification passed successfully!")



            # 12. Verify Projects Management API
            p_list_res = await client.get("/api/projects")
            assert p_list_res.status_code == 200
            print("12. /api/projects:", p_list_res.status_code, "Count:", len(p_list_res.json().get("projects", [])))

            p_create_res = await client.post("/api/projects", json={"name": "test_app", "template": "python"})
            assert p_create_res.status_code == 200
            assert p_create_res.json()["status"] in ("created", "exists")
            print("12b. Project created:", p_create_res.json())

            p_sel_res = await client.post("/api/projects/select", json={"name": "test_app"})
            assert p_sel_res.status_code == 200
            assert p_sel_res.json()["active_project"] == "test_app"
            print("12c. Project selected:", p_sel_res.json())

            # 13. Verify Terminal Execution API
            term_res = await client.post("/api/terminal/exec", json={"command": "python main.py", "project": "test_app"})
            assert term_res.status_code == 200
            term_data = term_res.json()
            assert term_data["exit_code"] == 0
            assert "Hello from Aether Code Agent" in term_data["stdout"]
            print("13. Terminal exec verified! Output:", term_data["stdout"], "Exit code:", term_data["exit_code"])

            # 14. Verify Code Mode System Prompt & Emoji Directives
            code_orch = AgentOrchestrator(ModelConfig(), mode="code", project="test_app")
            code_sys_prompt = code_orch._get_system_prompt()
            assert "AETHER CODE AGENT" in code_sys_prompt
            assert "視覺排版與生動表情符號表達準則" in code_sys_prompt
            assert "32K~64K Context / 16K Output" in code_sys_prompt
            print("14. Code mode system prompt & emoji directive verified successfully!")

            # 15. Verify Message Deletion & AI Session Title Endpoints
            test_msg = db.add_message(sess["id"], role="user", content="測試提示詞修改與刪除功能")
            del_res = await client.delete(f"/api/messages/{test_msg['id']}")
            assert del_res.status_code == 200
            assert del_res.json()["status"] == "deleted"

            db.add_message(sess["id"], role="user", content="討論量子計算與超導體架構設計")
            title_res = await client.post(f"/api/sessions/{sess['id']}/ai_title")
            assert title_res.status_code == 200
            assert "title" in title_res.json()
            assert len(title_res.json()["title"]) > 0
            print("15. Message deletion and AI session title API verified successfully! Title:", title_res.json()["title"])

            # 16. Verify PIN Auth Security Endpoints
            auth_st1 = await client.get("/api/auth/status")
            assert auth_st1.status_code == 200

            set_pin_res = await client.post("/api/auth/set-pin", json={"new_pin": "9999", "enabled": True})
            assert set_pin_res.status_code == 200
            assert set_pin_res.json()["pin_protected"] == True

            verify_fail = await client.post("/api/auth/verify-pin", json={"pin": "0000"})
            assert verify_fail.status_code == 401

            verify_ok = await client.post("/api/auth/verify-pin", json={"pin": "9999"})
            assert verify_ok.status_code == 200
            assert verify_ok.json()["authenticated"] == True

            # Disable PIN
            disable_res = await client.post("/api/auth/set-pin", json={"old_pin": "9999", "enabled": False})
            assert disable_res.status_code == 200
            assert disable_res.json()["pin_protected"] == False
            print("16. Web Access PIN security verified successfully!")

            # 17. Verify Web Filesystem Browser
            drives_res = await client.get("/api/system/fs-browse")
            assert drives_res.status_code == 200
            assert "items" in drives_res.json()
            assert len(drives_res.json()["items"]) > 0

            browse_proj = await client.get(f"/api/system/fs-browse?path={PROJECT_ROOT}")
            assert browse_proj.status_code == 200
            items_names = [i["name"] for i in browse_proj.json()["items"]]
            assert "backend" in items_names or "frontend" in items_names
            print("17. Web Filesystem Browser verified successfully!")

            # 18. Verify Git Status & AI Commit Endpoints
            import subprocess
            from backend.app.config import settings
            test_p_dir = settings.workspace_dir
            subprocess.run(["git", "init"], cwd=str(test_p_dir), capture_output=True)
            git_st_res = await client.get("/api/git/status")
            assert git_st_res.status_code == 200
            assert git_st_res.json()["is_git"] == True
            assert "branch" in git_st_res.json()

            ai_msg_res = await client.post("/api/git/ai-commit-msg")
            assert ai_msg_res.status_code == 200
            assert "commit_message" in ai_msg_res.json()
            assert len(ai_msg_res.json()["commit_message"]) > 0
            print("18. Git Status & AI Commit Message API verified successfully! Generated msg:", ai_msg_res.json()["commit_message"])

            # 19. Verify Terminal Process Kill
            kill_res = await client.post("/api/terminal/kill")
            assert kill_res.status_code == 200
            assert kill_res.json()["status"] == "ok"
            print("19. Terminal process kill management verified successfully!")

            # Cleanup test project
            import shutil
            from backend.app.config import settings
            test_proj_dir = settings.workspace_dir / "projects" / "test_app"
            if test_proj_dir.exists():
                shutil.rmtree(test_proj_dir)
            db.set_setting("active_project", None)

            # Cleanup test session

            if sess and sess.get("id"):
                await client.delete(f"/api/sessions/{sess['id']}")

    finally:

        if prev_tg_cfg is not None:

            db.set_setting("telegram_config", prev_tg_cfg)

        else:

            db.set_setting("telegram_config", {"token": "", "chat_id": "", "enabled": False})



    print("\n🎉 所有 Aether AI Studio 3.7.3 (AetherAgent) 後端、前端、22 大工具與 Telegram 橋接測試全部通過！")





if __name__ == "__main__":

    asyncio.run(run_tests())


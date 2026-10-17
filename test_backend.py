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
    try:
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Health check
            res = await client.get("/api/health")
            print("1. /api/health:", res.status_code, res.json())
            assert res.status_code == 200
            assert "AetherAI Studio 2.0 (AetherAgent)" in res.json()["app"]

            # 2. Get active model
            res = await client.get("/api/models/active")
            print("2. /api/models/active:", res.status_code, res.json())
            assert res.status_code == 200

            # 3. List tools
            res = await client.get("/api/tools")
            tools = res.json()
            print("3. /api/tools count:", len(tools), [t["name"] for t in tools])
            assert len(tools) >= 13

            # 4. List personas
            res = await client.get("/api/personas")
            personas = res.json()
            print("4. /api/personas count:", len(personas), [p["name"] for p in personas])
            assert len(personas) >= 4

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
            assert "AetherAI Studio 2.0" in res.text

            # Cleanup test session
            await client.delete(f"/api/sessions/{sess['id']}")
    finally:
        if prev_tg_cfg is not None:
            db.set_setting("telegram_config", prev_tg_cfg)
        else:
            db.set_setting("telegram_config", {"token": "", "chat_id": "", "enabled": False})

    print("\n🎉 所有 AetherAI Studio 2.0 (AetherAgent) 後端、前端、13 大工具與 Telegram 橋接測試全部通過！")


if __name__ == "__main__":
    asyncio.run(run_tests())

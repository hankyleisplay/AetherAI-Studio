import sys
from pathlib import Path
SITE_PACKAGES = Path(__file__).resolve().parent / "backend" / "site-packages"
sys.path.insert(0, str(SITE_PACKAGES))

import asyncio
import httpx
from backend.app.main import app

async def run_tests():
    transport = httpx.ASGITransport(app=app)
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
        assert len(tools) >= 8

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

        # 8. Telegram Config Save
        tg_cfg_res = await client.post(
            "/api/telegram/config",
            json={"token": "123456:FAKE_TOKEN_FOR_TEST", "chat_id": "12345678", "enabled": False}
        )
        print("8. Telegram save config:", tg_cfg_res.status_code, tg_cfg_res.json())
        assert tg_cfg_res.status_code == 200

        # 9. Verify SPA index.html serving
        res = await client.get("/")
        print("9. SPA / index.html status:", res.status_code, "Length:", len(res.text))
        assert res.status_code == 200
        assert "AetherAI Studio 2.0" in res.text

    print("\n🎉 所有 AetherAI Studio 2.0 (AetherAgent) 後端、前端、工具與 Telegram 橋接測試全部通過！")

if __name__ == "__main__":
    asyncio.run(run_tests())

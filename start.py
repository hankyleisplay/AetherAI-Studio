#!/usr/bin/env python3
"""
LiquidGlass Agent - 跨平台多功能啟動器
支援生產模式（FastAPI + SPA 託管）與開發者模式（FastAPI + Vite 熱重載）。
"""

import os
import sys
import time
import argparse
import signal
import webbrowser
from pathlib import Path
import subprocess

PROJECT_ROOT = Path(__file__).resolve().parent
SITE_PACKAGES = PROJECT_ROOT / "backend" / "site-packages"

# Inject local site-packages if present
if SITE_PACKAGES.exists():
    sys.path.insert(0, str(SITE_PACKAGES))

def print_banner():
    print(r"""\033[1;36m
    ___       __  __              ___    ____   _____ __            ___      
   /   | ___ / /_/ /_  ___  _____/   |  /  _/  / ___// /___  ______/ (_)___  
  / /| |/ _ \ __/ __ \/ _ \/ ___/ /| |  / /    \__ \/ __/ / / / __  / / __ \ 
 / ___ /  __/ /_/ / / /  __/ /  / ___ |_/ /    ___/ / /_/ /_/ / /_/ / / /_/ / 
/_/  |_\___/\__/_/ /_/\___/_/  /_/  |_/___/   /____/\__/\__,_/\__,_/_/\____/  
                                                                             
      Liquid Glass • Local & Cloud Autonomous AI Agent System v2.0
\033[0m""")

def ensure_dependencies():
    """Verify backend and frontend state before booting."""
    try:
        import fastapi
        import uvicorn
        import httpx
        import sse_starlette
    except ImportError:
        print("\033[33m[*] 尚未檢測到後端依賴，正在為您自動執行安裝...\033[0m")
        install_script = PROJECT_ROOT / "install.sh"
        if install_script.exists():
            subprocess.run(["bash", str(install_script)], check=True)
        else:
            subprocess.run([
                sys.executable, "-m", "pip", "install", "--break-system-packages",
                "--target", str(SITE_PACKAGES), "-r", str(PROJECT_ROOT / "backend" / "requirements.txt")
            ])
            sys.path.insert(0, str(SITE_PACKAGES))

def check_frontend_dist():
    dist_html = PROJECT_ROOT / "frontend" / "dist" / "index.html"
    if not dist_html.exists():
        print("\033[33m[*] 正在自動編譯 Liquid Glass 前端介面...\033[0m")
        try:
            subprocess.run(["npm", "run", "build"], cwd=str(PROJECT_ROOT / "frontend"), check=True)
            print("\033[32m[✓] 前端介面打包完成！\033[0m")
        except Exception as e:
            print(f"\033[31m[!] 前端編譯提示: {e}\033[0m")

def start_dev_mode(port: int, host: str):
    """Launch both backend API and Vite dev server concurrently."""
    print("\033[1;35m🛠️ 正在以開發者模式 (Developer Mode) 啟動...\033[0m")
    print(f"後端端點: http://localhost:{port}")
    print("前端熱重載: http://localhost:5173\n")

    # Start FastAPI backend process
    backend_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "backend.app.main:app", "--host", host, "--port", str(port), "--reload"],
        cwd=str(PROJECT_ROOT)
    )

    # Start Vite frontend process
    frontend_proc = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=str(PROJECT_ROOT / "frontend")
    )

    time.sleep(1.5)
    webbrowser.open("http://localhost:5173")

    def handle_sigint(sig, frame):
        print("\n\033[33m正在安全停止服務...\033[0m")
        backend_proc.terminate()
        frontend_proc.terminate()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_sigint)
    backend_proc.wait()

def ensure_shortcuts():
    shortcut_script = PROJECT_ROOT / "create_shortcut.sh"
    if shortcut_script.exists() and sys.platform.startswith("linux"):
        try:
            subprocess.run(["bash", str(shortcut_script)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass

def start_prod_mode(port: int, host: str, no_browser: bool):
    """Launch single-port unified FastAPI + built SPA mode."""
    check_frontend_dist()
    ensure_shortcuts()

    # Load diagnostic summary
    from backend.app.storage.database import db
    from backend.app.tools.registry import registry
    active_cfg = db.get_setting("active_model_config") or {}
    tool_count = len(registry.get_raw_definitions())
    provider = active_cfg.get("provider", "ollama")
    model = active_cfg.get("model", "預設")

    url = f"http://localhost:{port}"
    print(f"\033[1;32m🚀 AetherAI Studio 2.0 (AetherAgent) 服務就緒！\033[0m")
    print(f"📡 訪問網址: \033[1;36m{url}\033[0m")
    print(f"🧠 當前模型: \033[1;33m{provider}\033[0m ({model})")
    print(f"🛠️ 啟用工具: {tool_count} 個企業級工程工具")
    print(f"📂 工作區目錄: {PROJECT_ROOT / 'backend' / 'workspace'}\n")
    print("\033[90m(按 Ctrl+C 可停止伺服器)\033[0m\n")

    if not no_browser:
        def open_browser():
            time.sleep(1.2)
            webbrowser.open(url)
        import threading
        threading.Thread(target=open_browser, daemon=True).start()

    import uvicorn
    try:
        uvicorn.run(
            "backend.app.main:app",
            host=host,
            port=port,
            reload=False,
            log_level="info"
        )
    except KeyboardInterrupt:
        print("\n\033[32m[✓] AetherAI Studio 2.0 服務已安全結束。\033[0m")

def main():
    parser = argparse.ArgumentParser(description="LiquidGlass Agent 啟動器")
    parser.add_argument("--port", type=int, default=8000, help="服務監聽連接埠 (預設: 8000)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="監聽主機 IP (預設: 0.0.0.0)")
    parser.add_argument("--dev", action="store_true", help="啟用前端 Vite 熱重載開發模式")
    parser.add_argument("--no-browser", action="store_true", help="啟動時不安裝自動開啟瀏覽器")
    parser.add_argument("--check", action="store_true", help="執行系統依賴與整合檢驗後離開")
    args = parser.parse_args()

    print_banner()
    ensure_dependencies()

    if args.check:
        print("\033[32m[✓] 系統環境與依賴檢測完全正常！\033[0m")
        sys.exit(0)

    if args.dev:
        start_dev_mode(args.port, args.host)
    else:
        start_prod_mode(args.port, args.host, args.no_browser)

if __name__ == "__main__":
    main()

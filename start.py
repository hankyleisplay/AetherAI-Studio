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

# Configure UTF-8 console output and ANSI color support on Windows
if os.name == "nt":
    os.system("")
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PROJECT_ROOT = Path(__file__).resolve().parent
SITE_PACKAGES = PROJECT_ROOT / "backend" / "site-packages"

# Inject project root into sys.path
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# Safely check if local site-packages is healthy and accessible before prepending to sys.path
def _is_healthy_site_packages(p: Path) -> bool:
    if not p.exists():
        return False
    try:
        pyd_init = p / "pydantic" / "__init__.py"
        return pyd_init.exists() and pyd_init.is_file()
    except Exception:
        return False

if _is_healthy_site_packages(SITE_PACKAGES) and str(SITE_PACKAGES) not in sys.path:
    sys.path.insert(0, str(SITE_PACKAGES))

existing_pythonpath = os.environ.get("PYTHONPATH", "")
pythonpath_parts = [str(PROJECT_ROOT)]
if _is_healthy_site_packages(SITE_PACKAGES):
    pythonpath_parts.insert(0, str(SITE_PACKAGES))
if existing_pythonpath:
    pythonpath_parts.append(existing_pythonpath)
os.environ["PYTHONPATH"] = os.pathsep.join(pythonpath_parts)
os.environ["PYTHONIOENCODING"] = "utf-8"

NPM_CMD = "npm.cmd" if os.name == "nt" else "npm"


def print_banner():
    banner = (
        "\033[1;36m\n"
        r"    ___       __  __              ___    ____   _____ __            ___      " "\n"
        r"   /   | ___ / /_/ /_  ___  _____/   |  /  _/  / ___// /___  ______/ (_)___  " "\n"
        r"  / /| |/ _ \ __/ __ \/ _ \/ ___/ /| |  / /    \__ \/ __/ / / / __  / / __ \ " "\n"
        r" / ___ /  __/ /_/ / / /  __/ /  / ___ |_/ /    ___/ / /_/ /_/ / /_/ / / /_/ / " "\n"
        r"/_/  |_\___/\__/_/ /_/\___/_/  /_/  |_/___/   /____/\__/\__,_/\__,_/_/\____/  " "\n"
        "\n"
        "      Liquid Glass 3.5 • Next-Gen Desktop Autonomous AI Agent (Official Release)\n"
        "\033[0m"
    )
    print(banner)


def check_core_dependencies() -> bool:
    """Check if all critical backend dependencies can be imported cleanly."""
    try:
        import fastapi
        import uvicorn
        import httpx
        import sse_starlette
        import psutil
        import multipart
        from pydantic import BaseModel
        from pydantic_settings import BaseSettings
        return True
    except Exception:
        return False


def ensure_dependencies():
    """Verify backend and frontend state before booting."""
    if not check_core_dependencies():
        print("\033[33m[*] 尚未檢測到完整後端依賴，正在為您自動執行安裝...\033[0m")
        req_file = PROJECT_ROOT / "backend" / "requirements.txt"
        
        # 1. Standard pip install into current environment
        cmd_std = [sys.executable, "-m", "pip", "install", "-r", str(req_file)]
        res = subprocess.run(cmd_std)
        if res.returncode != 0:
            # 2. Try with --user flag
            cmd_user = [sys.executable, "-m", "pip", "install", "--user", "-r", str(req_file)]
            res = subprocess.run(cmd_user)
            if res.returncode != 0 and os.name != "nt":
                subprocess.run(cmd_std + ["--break-system-packages"], check=False)


def check_frontend_dist():
    dist_html = PROJECT_ROOT / "frontend" / "dist" / "index.html"
    if not dist_html.exists():
        print("\033[33m[*] 正在自動編譯 Liquid Glass 前端介面...\033[0m")
        try:
            frontend_dir = PROJECT_ROOT / "frontend"
            if not (frontend_dir / "node_modules").exists():
                subprocess.run([NPM_CMD, "install"], cwd=str(frontend_dir), check=True)
            subprocess.run([NPM_CMD, "run", "build"], cwd=str(frontend_dir), check=True)
            print("\033[32m[✓] 前端介面打包完成！\033[0m")
        except Exception as e:
            print(f"\033[31m[!] 前端編譯提示: {e}\033[0m")


def start_dev_mode(port: int, host: str):
    """Launch both backend API and Vite dev server concurrently."""
    print("\033[1;35m🛠️ 正在以開發者模式 (Developer Mode) 啟動...\033[0m")
    print(f"後端端點: http://localhost:{port}")
    print("前端熱重載: http://localhost:5173\n")

    # Start FastAPI backend process (watching only backend/app, ignoring workspace and data)
    backend_proc = subprocess.Popen(
        [
            sys.executable, "-m", "uvicorn", "backend.app.main:app",
            "--host", host,
            "--port", str(port),
            "--reload",
            "--reload-dir", str(PROJECT_ROOT / "backend" / "app"),
            "--reload-exclude", "*workspace*",
            "--reload-exclude", "*data*"
        ],
        cwd=str(PROJECT_ROOT),
        env=os.environ.copy()
    )

    # Start Vite frontend process
    frontend_proc = subprocess.Popen(
        [NPM_CMD, "run", "dev"],
        cwd=str(PROJECT_ROOT / "frontend"),
        env=os.environ.copy()
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


def launch_desktop_window(url: str):
    """
    Launch native desktop window using Chrome/Edge in standalone app mode.
    Falls back to system default browser if neither is available.
    """
    import shutil

    candidates = []
    if sys.platform == "win32":
        candidates = [
            os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%LocalAppData%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"),
        ]
    elif sys.platform == "darwin":
        candidates = [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
            "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        ]
    else:  # Linux / Unix
        for bin_name in ["google-chrome", "google-chrome-stable", "chromium-browser", "chromium", "microsoft-edge"]:
            p = shutil.which(bin_name)
            if p:
                candidates.append(p)

    for exe in candidates:
        if exe and os.path.exists(exe):
            try:
                cmd = [
                    exe,
                    f"--app={url}",
                    "--window-size=1360,900",
                    "--window-position=center",
                    "--user-data-dir=" + str(PROJECT_ROOT / "backend" / "data" / "desktop_profile"),
                    "--app-id=aetherai_studio_3",
                    "--disable-extensions",
                ]
                return subprocess.Popen(cmd)
            except Exception:
                continue

    # Fallback to standard browser
    webbrowser.open(url)
    return None


def start_prod_mode(port: int, host: str, no_browser: bool, desktop: bool = False):
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
    print("\033[1;32m🚀 Aether AI Studio 3.5 (Official Release) 服務就緒！\033[0m")
    if desktop:
        print("\033[1;35m🖥️  已啟用原生獨立桌面視窗模式 (Standalone Desktop Mode)\033[0m")
    print(f"📡 訪問網址: \033[1;36m{url}\033[0m")
    print(f"🧠 當前模型: \033[1;33m{provider}\033[0m ({model})")
    print(f"🛠️ 啟用工具: {tool_count} 個企業級工程工具")
    print(f"📂 工作區目錄: {PROJECT_ROOT / 'backend' / 'workspace'}\n")
    print("\033[90m(按 Ctrl+C 可停止伺服器)\033[0m\n")

    if desktop:
        def open_desktop():
            time.sleep(1.2)
            launch_desktop_window(url)
        import threading
        threading.Thread(target=open_desktop, daemon=True).start()
    elif not no_browser:
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
        print("\n\033[32m[✓] Aether AI Studio 3.5 服務已安全結束。\033[0m")


def main():
    parser = argparse.ArgumentParser(description="LiquidGlass Agent 啟動器")
    parser.add_argument("--port", type=int, default=8000, help="服務監聽連接埠 (預設: 8000)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="監聽主機 IP (預設: 0.0.0.0)")
    parser.add_argument("--dev", action="store_true", help="啟用前端 Vite 熱重載開發模式")
    parser.add_argument("--desktop", action="store_true", help="以原生獨立桌面視窗模式執行 (Aether AI Studio 3.5 桌面版)")
    parser.add_argument("--no-browser", action="store_true", help="啟動時不自動開啟瀏覽器")
    parser.add_argument("--check", action="store_true", help="執行系統依賴與整合檢驗後離開")
    args = parser.parse_args()

    print_banner()
    ensure_dependencies()

    if args.check:
        from backend.app.storage.database import db
        from backend.app.tools.registry import registry
        tools = registry.get_raw_definitions()
        personas = db.list_personas()
        print(f"\033[32m[✓] 系統環境與依賴檢測完全正常！（已載入 {len(tools)} 個工具、{len(personas)} 個預設角色）\033[0m")
        sys.exit(0)

    if args.dev:
        start_dev_mode(args.port, args.host)
    else:
        start_prod_mode(args.port, args.host, args.no_browser, desktop=args.desktop)


if __name__ == "__main__":
    main()

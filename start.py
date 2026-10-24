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
os.environ["OLLAMA_FLASH_ATTENTION"] = "false"

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
        "      Liquid Glass 3.7.3 • Next-Gen Desktop Autonomous AI Agent (Official Release)\n"
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

def is_port_in_use(port: int, host: str = "127.0.0.1") -> bool:
    import socket
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind((host, port))
            return False
    except OSError:
        return True

def find_available_port(start_port: int, max_attempts: int = 100) -> int:
    """Find the next available TCP port starting from start_port."""
    for p in range(start_port, start_port + max_attempts):
        if not is_port_in_use(p):
            return p
    return start_port

def free_port_if_aether(port: int) -> bool:
    """Attempt to terminate any previous or zombie Aether instance listening on this port."""
    import psutil
    freed = False
    try:
        for conn in psutil.net_connections(kind="inet"):
            if conn.laddr.port == port and conn.status == "LISTEN" and conn.pid:
                if conn.pid != os.getpid():
                    try:
                        proc = psutil.Process(conn.pid)
                        cmd = " ".join(proc.cmdline() or []).lower()
                        if "start.py" in cmd or "uvicorn" in cmd or "test_backend.py" in cmd or "aether" in cmd:
                            print(f"\033[33m[*] 檢測到埠號 {port} 被先前未結束的背景進程 (PID: {conn.pid}) 佔用，正在為您自動釋放...\033[0m")
                            proc.terminate()
                            try:
                                proc.wait(timeout=2)
                            except Exception:
                                proc.kill()
                            freed = True
                    except Exception:
                        pass
    except Exception:
        pass
    if freed:
        time.sleep(0.5)
    return freed

def wait_for_server(port: int, timeout: float = 30.0) -> bool:
    """Poll localhost:{port}/api/health until FastAPI/Uvicorn server is 100% ready."""
    import urllib.request
    start_t = time.time()
    url = f"http://127.0.0.1:{port}/api/health"
    while time.time() - start_t < timeout:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Aether-HealthCheck"})
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(0.25)
    return False

def launch_desktop_window(url: str, low_spec: bool = False):
    """
    Launch native desktop window using Chrome/Edge in standalone app mode with isolated profile.
    Guarantees exactly ONE window is launched and isolates it from regular browser tabs.
    Falls back to system default browser only if no standalone browser is available.
    """
    import shutil
    from pathlib import Path

    candidates = []
    if sys.platform == "win32":
        candidates = [
            os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"),
            os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%LocalAppData%\Microsoft\Edge\Application\msedge.exe"),
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

    # Use a dedicated profile directory so the desktop app runs as an independent, single-instance process
    profile_dir = Path.home() / ".aether" / "desktop_profile"
    try:
        profile_dir.mkdir(parents=True, exist_ok=True)
        # Purge stale disk cache so newest assets and HTML are guaranteed to load immediately
        for stale_sub in ["Cache", "Code Cache"]:
            stale_path = profile_dir / "Default" / stale_sub
            if stale_path.exists():
                shutil.rmtree(stale_path, ignore_errors=True)
    except Exception:
        profile_dir = None

    for exe in candidates:
        if exe and os.path.exists(exe):
            try:
                cmd = [
                    exe,
                    f"--app={url}",
                    "--window-size=1360,900",
                    "--window-position=center",
                    "--disable-extensions",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-http-cache",
                    "--disable-application-cache",
                ]
                if profile_dir:
                    cmd.append(f"--user-data-dir={profile_dir}")

                p = subprocess.Popen(cmd)
                # Success! Return immediately to guarantee single-instance window and prevent duplicate openings
                return p
            except Exception:
                continue

    # Fallback to standard browser only if standalone execution failed completely
    webbrowser.open(url)
    return None

def start_prod_mode(port: int, host: str, no_browser: bool, desktop: bool = False, low_spec: bool = False):
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

    # Auto-switch to next available port if requested port is in use (Multi-instance support)
    actual_port = port
    if is_port_in_use(port, "127.0.0.1"):
        actual_port = find_available_port(port + 1)
        print(f"\033[1;33m[*] 檢測到連接埠 {port} 正在使用，已自動切換至可用連接埠: {actual_port} (多開模式支援)\033[0m")

    url = f"http://localhost:{actual_port}"
    if low_spec:
        url += "?eco=1"
    print("\033[1;32m🚀 Aether AI Studio 3.7.3 (Official Release) 服務就緒！\033[0m")
    if actual_port != port:
        print(f"\033[1;35m✨ 多開實例已啟用 (連接埠: {actual_port})\033[0m")
    if desktop:
        print("\033[1;35m🖥️  已啟用原生獨立桌面視窗模式 (Standalone Desktop Mode)\033[0m")
    if low_spec:
        os.environ["AETHER_LOW_SPEC"] = "1"
        print("\033[1;33m⚡ 已啟用節能/輕量硬體優化模式 (Low-Resource Mode)\033[0m")
    print(f"📡 訪問網址: \033[1;36m{url}\033[0m")
    print(f"🧠 當前模型: \033[1;33m{provider}\033[0m ({model})")
    print(f"🛠️ 啟用工具: {tool_count} 個企業級工程工具")
    print(f"📂 工作區目錄: {PROJECT_ROOT / 'backend' / 'workspace'}\n")
    print("\033[90m(按 Ctrl+C 可停止伺服器)\033[0m\n")

    if desktop:
        def open_desktop():
            # Wait until FastAPI and Uvicorn are actually accepting HTTP requests
            if not wait_for_server(actual_port, timeout=30.0):
                print(f"\033[31m[!] 伺服器啟動逾時 (Port {actual_port})，無法自動開啟桌面視窗。\033[0m")
                return

            time.sleep(0.3)
            p = launch_desktop_window(url, low_spec=low_spec)
            if p and hasattr(p, "wait"):
                t_spawn = time.time()
                try:
                    p.wait()
                    # Only exit if the desktop window was open for more than 3 seconds (avoid accidental premature exits)
                    if time.time() - t_spawn > 3.0:
                        print("\n\033[32m[✓] 原生桌面視窗已關閉，正在安全退出後端伺服器...\033[0m")
                        os.kill(os.getpid(), signal.SIGTERM if hasattr(signal, "SIGTERM") else signal.SIGINT)
                except Exception:
                    pass
        import threading
        threading.Thread(target=open_desktop, daemon=True).start()
    elif not no_browser:
        def open_browser():
            if wait_for_server(actual_port, timeout=30.0):
                time.sleep(0.3)
                webbrowser.open(url)
        import threading
        threading.Thread(target=open_browser, daemon=True).start()

    import uvicorn
    try:
        uvicorn.run(
            "backend.app.main:app",
            host=host,
            port=actual_port,
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
    parser.add_argument("--low-spec", action="store_true", help="啟用節能輕量硬體模式 (停用高耗能 GPU 特效與降低記憶體佔用)")
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
        start_prod_mode(args.port, args.host, args.no_browser, desktop=args.desktop, low_spec=args.low_spec)

if __name__ == "__main__":
    main()

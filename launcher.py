#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Aether AI Studio 3.5 - 官方專屬統一啟動器 (Official Standalone Launcher)
自動檢查更新 • 模式切換（獨立桌面版 vs 終端 CLI 版 vs 瀏覽器版） • 桌面捷徑 • 跨平台高相容
"""

import os
import sys
import time
import argparse
import subprocess
import threading
import webbrowser
from pathlib import Path

# Configure Windows console for UTF-8
if os.name == "nt":
    os.system("")
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Determine Project Root
if getattr(sys, "frozen", False):
    # PyInstaller bundle directory
    LAUNCHER_DIR = Path(sys.executable).resolve().parent
else:
    LAUNCHER_DIR = Path(__file__).resolve().parent

PROJECT_ROOT = LAUNCHER_DIR

# If run from outside (e.g. Downloads folder), search for project root
if not (PROJECT_ROOT / "start.py").exists():
    candidates = [
        PROJECT_ROOT / "AetherAI-Studio",
        Path.home() / "AetherAI-Studio",
        PROJECT_ROOT.parent / "AetherAI-Studio",
        Path.home() / "Documents" / "Project" / "AetherAI-Studio"
    ]
    for c in candidates:
        if (c / "start.py").exists():
            PROJECT_ROOT = c
            break

VERSION = "3.7.1"


def print_banner():
    banner = (
        "\033[1;36m\n"
        r"    ___       __  __              ___    ____   _____ __            ___      " "\n"
        r"   /   | ___ / /_/ /_  ___  _____/   |  /  _/  / ___// /___  ______/ (_)___  " "\n"
        r"  / /| |/ _ \ __/ __ \/ _ \/ ___/ /| |  / /    \__ \/ __/ / / / __  / / __ \ " "\n"
        r" / ___ /  __/ /_/ / / /  __/ /  / ___ |_/ /    ___/ / /_/ /_/ / /_/ / / /_/ / " "\n"
        r"/_/  |_\___/\__/_/ /_/\___/_/  /_/  |_/___/   /____/\__/\__,_/\__,_/_/\____/  " "\n"
        f"\n"
        f"      Aether AI Studio {VERSION} (Official Release) • 官方專屬啟動器\n"
        "      次世代獨立原生桌面代理 • 實時推論 HUD • 即時畫布 • 22 大工具鏈\n"
        "\033[0m"
    )
    print(banner)


def create_desktop_shortcut() -> bool:
    """Create a Windows desktop shortcut pointing to the launcher."""
    try:
        target_exe = PROJECT_ROOT / "AetherLauncher.exe"
        if target_exe.exists():
            target_path = str(target_exe)
            target_args = ""
        else:
            target_path = sys.executable
            target_args = f'"{PROJECT_ROOT / "launcher.py"}"'

        ps_code = f"""
$desktop = [Environment]::GetFolderPath('Desktop')
$s = (New-Object -COM WScript.Shell).CreateShortcut("$desktop\\Aether AI Studio 3.5.lnk")
$s.TargetPath = '{target_path}'
$s.Arguments = '{target_args}'
$s.WorkingDirectory = '{PROJECT_ROOT}'
$s.Description = 'Aether AI Studio 3.5 官方專屬啟動器'
$s.Save()
"""
        subprocess.run(["powershell", "-NoProfile", "-Command", ps_code], capture_output=True, check=True)
        return True
    except Exception:
        return False


def check_for_updates(auto_pull: bool = True) -> tuple[bool, str]:
    """Check for git or release updates silently or with notification."""
    try:
        git_check = subprocess.run(
            ["git", "rev-parse", "--is-inside-work-tree"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=4
        )
        if git_check.returncode == 0:
            subprocess.run(
                ["git", "fetch", "origin"],
                capture_output=True,
                text=True,
                cwd=str(PROJECT_ROOT),
                timeout=8
            )
            local_hash = subprocess.run(
                ["git", "rev-parse", "HEAD"],
                capture_output=True,
                text=True,
                cwd=str(PROJECT_ROOT)
            ).stdout.strip()

            branch_res = subprocess.run(
                ["git", "rev-parse", "--abbrev-ref", "HEAD"],
                capture_output=True,
                text=True,
                cwd=str(PROJECT_ROOT)
            ).stdout.strip()

            remote_ref = f"origin/{branch_res}" if branch_res else "@{u}"
            remote_hash_res = subprocess.run(
                ["git", "rev-parse", remote_ref],
                capture_output=True,
                text=True,
                cwd=str(PROJECT_ROOT)
            )
            remote_hash = remote_hash_res.stdout.strip() if remote_hash_res.returncode == 0 else ""

            if remote_hash and local_hash != remote_hash:
                if auto_pull:
                    print("\033[1;33m[*] 檢測到新版本程式碼更新，正在自動為您拉取更新...\033[0m")
                    pull_res = subprocess.run(["git", "pull"], capture_output=True, text=True, cwd=str(PROJECT_ROOT), timeout=15)
                    if pull_res.returncode == 0:
                        print("\033[1;32m[✓] 已順利更新至最新版本！\033[0m")
                        return True, "已自動更新至最新版本"
                    else:
                        return False, "拉取更新失敗，請檢查網路連線"
                else:
                    return True, "發現新版本可用"
            else:
                return False, f"已是最新正式版 v{VERSION}"
    except Exception as e:
        return False, f"檢查更新略過 ({e})"
    return False, f"版本就緒 v{VERSION}"


def run_aether(mode: str = "desktop", port: int = 8000, host: str = "0.0.0.0"):
    """Launch start.py in chosen mode."""
    start_py = PROJECT_ROOT / "start.py"
    if not start_py.exists():
        print(f"\033[31m[❌ 錯誤] 找不到主程式 {start_py}\033[0m")
        input("請按任意鍵繼續...")
        return

    cmd = [sys.executable, str(start_py), "--port", str(port), "--host", str(host)]

    if mode == "desktop":
        cmd.append("--desktop")
    elif mode == "cli":
        cmd.append("--no-browser")
    elif mode == "check":
        cmd.append("--check")

    try:
        subprocess.run(cmd, cwd=str(PROJECT_ROOT))
    except KeyboardInterrupt:
        print("\n\033[32m[✓] Aether AI Studio 已安全結束。\033[0m")


def start_gui():
    """Launch Modern Dark-Theme Liquid Glass GUI Launcher."""
    try:
        import tkinter as tk
        from tkinter import ttk, messagebox
    except ImportError:
        print("[!] 系統未安裝 Tkinter，退回使用互動命令列啟動選單。")
        start_cli_menu()
        return

    root = tk.Tk()
    root.title(f"Aether AI Studio {VERSION} - 官方啟動器")
    root.geometry("540x510")
    root.resizable(False, False)
    root.configure(bg="#0b0f19")

    # Center window
    root.update_idletasks()
    x = (root.winfo_screenwidth() // 2) - (540 // 2)
    y = (root.winfo_screenheight() // 2) - (510 // 2)
    root.geometry(f"+{x}+{y}")

    # Top Brand Header
    header_frame = tk.Frame(root, bg="#0f172a", pady=18, padx=20)
    header_frame.pack(fill="x")

    title_label = tk.Label(
        header_frame,
        text="AETHER AI STUDIO 3.5",
        font=("Segoe UI", 16, "bold"),
        fg="#00f2fe",
        bg="#0f172a"
    )
    title_label.pack(anchor="w")

    sub_label = tk.Label(
        header_frame,
        text="次世代獨立原生桌面代理系統 • 官方正式發行版 (Official Release)",
        font=("Segoe UI", 9),
        fg="#94a3b8",
        bg="#0f172a"
    )
    sub_label.pack(anchor="w", pady=(2, 0))

    # Update Status Banner
    status_var = tk.StringVar(value="⏳ 正在檢查版本更新...")
    status_bar = tk.Label(
        root,
        textvariable=status_var,
        font=("Segoe UI", 9),
        fg="#38bdf8",
        bg="#1e293b",
        pady=6
    )
    status_bar.pack(fill="x", pady=(0, 15))

    def async_update_check():
        has_update, msg = check_for_updates(auto_pull=True)
        if has_update:
            status_var.set("🎉 已為您自動更新至最新版本！")
            status_bar.configure(fg="#34d399")
        else:
            status_var.set(f"✅ {msg}")
            status_bar.configure(fg="#38bdf8")

    threading.Thread(target=async_update_check, daemon=True).start()

    # Content Frame
    body_frame = tk.Frame(root, bg="#0b0f19", padx=28)
    body_frame.pack(fill="both", expand=True)

    choice_label = tk.Label(
        body_frame,
        text="請選擇啟動模式：",
        font=("Segoe UI", 11, "bold"),
        fg="#f1f5f9",
        bg="#0b0f19"
    )
    choice_label.pack(anchor="w", pady=(0, 10))

    def launch_desktop():
        root.destroy()
        run_aether("desktop")

    def launch_cli():
        root.destroy()
        run_aether("cli")

    def launch_browser():
        root.destroy()
        run_aether("browser")

    # Big Button 1: Standalone Desktop App (Recommended)
    btn_desktop = tk.Button(
        body_frame,
        text="🖥️  啟動獨立原生桌面版 (Standalone Desktop App)\n原生視窗 • 沉浸專注無干擾 • 實時推論 HUD (推薦)",
        font=("Segoe UI", 10, "bold"),
        fg="#ffffff",
        bg="#0284c7",
        activebackground="#0369a1",
        activeforeground="#ffffff",
        relief="flat",
        cursor="hand2",
        pady=10,
        command=launch_desktop
    )
    btn_desktop.pack(fill="x", pady=5)

    # Big Button 2: Terminal CLI Mode (Headless / Server)
    btn_cli = tk.Button(
        body_frame,
        text="💻  啟動終端命令列版 (CLI Mode / Headless Server)\n直接在終端監控日誌與輸出 • 不自動彈出瀏覽器",
        font=("Segoe UI", 10, "bold"),
        fg="#e2e8f0",
        bg="#334155",
        activebackground="#475569",
        activeforeground="#ffffff",
        relief="flat",
        cursor="hand2",
        pady=10,
        command=launch_cli
    )
    btn_cli.pack(fill="x", pady=5)

    # Big Button 3: Web Browser Mode
    btn_browser = tk.Button(
        body_frame,
        text="🌐  啟動一般網頁瀏覽器版 (Web Browser Mode)\n自動於預設瀏覽器分頁中開啟 (http://localhost:8000)",
        font=("Segoe UI", 10),
        fg="#cbd5e1",
        bg="#1e293b",
        activebackground="#334155",
        activeforeground="#ffffff",
        relief="flat",
        cursor="hand2",
        pady=8,
        command=launch_browser
    )
    btn_browser.pack(fill="x", pady=5)

    # Footer Actions
    footer_frame = tk.Frame(root, bg="#0b0f19", padx=28, pady=12)
    footer_frame.pack(fill="x", side="bottom")

    def on_check_diagnostics():
        root.destroy()
        run_aether("check")

    def on_force_update():
        status_var.set("🔄 正在向 GitHub 檢查並拉取最新版本...")
        has_update, msg = check_for_updates(auto_pull=True)
        messagebox.showinfo("版本檢查結果", msg)
        status_var.set(f"✅ {msg}")

    def on_create_shortcut():
        ok = create_desktop_shortcut()
        if ok:
            messagebox.showinfo("成功", "已在您的 Windows 桌面上建立「Aether AI Studio 3.5」捷徑！")
        else:
            messagebox.showwarning("提示", "未能自動建立桌面捷徑。")

    btn_diag = tk.Button(
        footer_frame,
        text="🩺 環境診斷",
        font=("Segoe UI", 8),
        fg="#94a3b8",
        bg="#0f172a",
        relief="flat",
        cursor="hand2",
        command=on_check_diagnostics
    )
    btn_diag.pack(side="left")

    btn_manual_update = tk.Button(
        footer_frame,
        text="🔄 檢查更新",
        font=("Segoe UI", 8),
        fg="#94a3b8",
        bg="#0f172a",
        relief="flat",
        cursor="hand2",
        command=on_force_update
    )
    btn_manual_update.pack(side="left", padx=6)

    btn_shortcut = tk.Button(
        footer_frame,
        text="⭐ 建立桌面捷徑",
        font=("Segoe UI", 8),
        fg="#94a3b8",
        bg="#0f172a",
        relief="flat",
        cursor="hand2",
        command=on_create_shortcut
    )
    btn_shortcut.pack(side="left")

    lbl_version = tk.Label(
        footer_frame,
        text=f"v{VERSION} Official",
        font=("Segoe UI", 8, "italic"),
        fg="#64748b",
        bg="#0b0f19"
    )
    lbl_version.pack(side="right")

    root.mainloop()


def start_cli_menu():
    """Interactive command-line selector."""
    print_banner()

    print("\033[1;33m[*] 正在自動檢查版本更新...\033[0m")
    has_update, msg = check_for_updates(auto_pull=True)
    if has_update:
        print("\033[1;32m[✓] 專案已同步更新至最新版本！\033[0m")
    else:
        print(f"\033[1;36m[i] {msg}\033[0m")

    print("\n" + "=" * 62)
    print(" 請選擇 Aether AI Studio 3.5 啟動模式：")
    print("  [1] 🖥️  獨立原生桌面版 (Standalone Desktop App) - [推薦，沉浸無分頁干擾]")
    print("  [2] 💻  終端命令列版 (CLI Mode / Headless Server) - [即時終端輸出]")
    print("  [3] 🌐  一般瀏覽器版 (Web Browser Mode) - [開啟預設瀏覽器]")
    print("  [4] ⭐  在 Windows 桌面建立專屬啟動捷徑 (Create Desktop Shortcut)")
    print("  [5] 🔄  強制檢查並拉取更新 (Force Update)")
    print("  [6] 🩺  執行系統與 22 大工具健康診斷 (Health Check)")
    print("=" * 62 + "\n")

    try:
        choice = input("請輸入選項 [1/2/3/4/5/6] (直接按 Enter 預設為桌面版 1): ").strip()
    except (EOFError, KeyboardInterrupt):
        print("\n使用者已取消。")
        return

    if choice == "2":
        print("\n\033[1;36m[✓] 正在為您啟動 Aether AI Studio 終端命令列 (CLI) 伺服器版...\033[0m\n")
        run_aether("cli")
    elif choice == "3":
        print("\n\033[1;36m[✓] 正在為您啟動 Aether AI Studio 一般瀏覽器版...\033[0m\n")
        run_aether("browser")
    elif choice == "4":
        if create_desktop_shortcut():
            print("\n\033[1;32m[✓] 已成功在您的 Windows 桌面建立「Aether AI Studio 3.5」捷徑！\033[0m\n")
        else:
            print("\n\033[1;31m[!] 建立捷徑失敗。\033[0m\n")
        start_cli_menu()
    elif choice == "5":
        print("\n\033[1;33m[*] 正在向遠端倉庫同步最新更新...\033[0m")
        check_for_updates(auto_pull=True)
        print("\n更新完畢，返回主選單。\n")
        start_cli_menu()
    elif choice == "6":
        run_aether("check")
    else:
        print("\n\033[1;32m[✓] 正在為您啟動 Aether AI Studio 獨立原生桌面版...\033[0m\n")
        run_aether("desktop")


def main():
    parser = argparse.ArgumentParser(description="Aether AI Studio 官方專屬啟動器")
    parser.add_argument("--cli", action="store_true", help="強制以文字命令列選單模式執行啟動器")
    parser.add_argument("--desktop", action="store_true", help="直接啟動獨立桌面版")
    parser.add_argument("--server", action="store_true", help="直接啟動 CLI 伺服器版")
    parser.add_argument("--port", type=int, default=8000, help="服務監聽埠號 (預設: 8000)")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="監聽 IP (預設: 0.0.0.0)")
    args = parser.parse_args()

    if args.desktop:
        check_for_updates(auto_pull=True)
        run_aether("desktop", port=args.port, host=args.host)
        return

    if args.server:
        check_for_updates(auto_pull=True)
        run_aether("cli", port=args.port, host=args.host)
        return

    # If --cli specified or no GUI environment, use terminal menu
    if args.cli or not os.environ.get("DISPLAY", "") and os.name != "nt":
        start_cli_menu()
    else:
        # Default on Windows: Try modern GUI Launcher first, fallback to CLI
        try:
            start_gui()
        except Exception:
            start_cli_menu()


if __name__ == "__main__":
    main()

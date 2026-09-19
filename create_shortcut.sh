#!/usr/bin/env bash
# ==============================================================================
# AetherAI Studio 2.0 (AetherAgent) - Linux Desktop Shortcut Creator
# Automatically installs launcher to user Desktop and Application Menu
# ==============================================================================

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ICON_PATH="${PROJECT_DIR}/assets/icon.svg"
RUN_SCRIPT="${PROJECT_DIR}/run.sh"

chmod +x "${RUN_SCRIPT}" || true

# 1. Determine Desktop Directory (Handles multilingual setups like '桌面' / 'Desktop')
DESKTOP_DIR=""
if command -v xdg-user-dir >/dev/null 2>&1; then
    DESKTOP_DIR="$(xdg-user-dir DESKTOP)"
fi

if [ -z "${DESKTOP_DIR}" ] || [ ! -d "${DESKTOP_DIR}" ]; then
    if [ -d "$HOME/桌面" ]; then
        DESKTOP_DIR="$HOME/桌面"
    elif [ -d "$HOME/Desktop" ]; then
        DESKTOP_DIR="$HOME/Desktop"
    else
        DESKTOP_DIR="$HOME/Desktop"
        mkdir -p "${DESKTOP_DIR}"
    fi
fi

APP_MENU_DIR="$HOME/.local/share/applications"
mkdir -p "${APP_MENU_DIR}"

DESKTOP_FILE_CONTENT="[Desktop Entry]
Version=1.0
Type=Application
Name=AetherAI Studio 2.0
GenericName=Autonomous AI Agent System
Comment=企業級本地與雲端雙模自主智能體系統 (Liquid Glass Edition)
Exec=/bin/bash \"${RUN_SCRIPT}\"
Icon=${ICON_PATH}
Path=${PROJECT_DIR}
Terminal=true
Categories=Development;ArtificialIntelligence;Utility;System;
StartupNotify=true
Keywords=AI;Agent;LLM;Ollama;DeepSeek;Aether;
"

# 2. Write to Desktop
DESKTOP_TARGET="${DESKTOP_DIR}/AetherAI-Studio.desktop"
echo "${DESKTOP_FILE_CONTENT}" > "${DESKTOP_TARGET}"
chmod +x "${DESKTOP_TARGET}"

# Allow launching in GNOME without untrusted warning if gio exists
if command -v gio >/dev/null 2>&1; then
    gio set "${DESKTOP_TARGET}" metadata::trusted true 2>/dev/null || true
fi

# 3. Write to Application Menu
MENU_TARGET="${APP_MENU_DIR}/aetherai-studio.desktop"
echo "${DESKTOP_FILE_CONTENT}" > "${MENU_TARGET}"
chmod +x "${MENU_TARGET}"

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "${APP_MENU_DIR}" 2>/dev/null || true
fi

echo -e "\033[1;32m[+] 桌面捷徑已成功建立：${DESKTOP_TARGET}\033[0m"
echo -e "\033[1;32m[+] 應用程式選單捷徑已註冊：${MENU_TARGET}\033[0m"

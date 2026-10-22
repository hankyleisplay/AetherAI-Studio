@echo off
setlocal
chcp 65001 >nul 2>&1
title Aether AI Studio 3.5 QuickStart

set "SCRIPT_DIR=%~dp0"
set "PS1_FILE=%SCRIPT_DIR%quickstart.ps1"

:: If quickstart.ps1 is not present alongside quickstart.bat (e.g. downloaded standalone into Downloads folder)
if not exist "%PS1_FILE%" (
    echo.
    echo ==============================================================
    echo          Aether AI Studio 3.5 QuickStart
    echo ==============================================================
    echo [*] 正在取得 Aether AI Studio 3.5 啟動腳本 quickstart.ps1 ...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; try { (New-Object System.Net.WebClient).DownloadFile('https://raw.githubusercontent.com/hankyleisplay/AetherAI-Studio/v3.5-experimental/quickstart.ps1', '%PS1_FILE%') } catch { exit 1 }"
    if not exist "%PS1_FILE%" (
        curl.exe -fsSL "https://raw.githubusercontent.com/hankyleisplay/AetherAI-Studio/v3.5-experimental/quickstart.ps1" -o "%PS1_FILE%" >nul 2>&1
    )
)

if not exist "%PS1_FILE%" (
    echo.
    echo [!] 無法取得 quickstart.ps1，請確認網路連線是否正常。
    echo 或請直接至 GitHub Release 下載 AetherAI-Studio-3.5-Official-Launcher.zip 解壓縮後執行。
    echo.
    pause
    exit /b 1
)

:: Automatically unblock the downloaded script to prevent digital signature warnings on Windows
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Unblock-File -Path '%PS1_FILE%' -ErrorAction SilentlyContinue"

:: Execute quickstart.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PS1_FILE%"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] 執行中斷，錯誤代碼: %ERRORLEVEL%
    pause
)

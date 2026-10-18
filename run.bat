@echo off
chcp 65001 >nul 2>&1
title Aether AI Studio 3.0

if not "%~1"=="" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
    goto :eof
)

cls
echo ==============================================================
echo          Aether AI Studio 3.0 (AetherAgent)
echo    Liquid Glass 3.0 - Next-Gen Desktop Autonomous AI Agent
echo ==============================================================
echo.
echo 請選擇啟動模式 / Select Launch Mode:
echo.
echo   [1] 獨立桌面視窗版 (Desktop App) - 原生獨立視窗、沉浸極簡體驗 (推薦)
echo   [2] 一般網頁瀏覽器版 (Web Browser) - 自動於預設瀏覽器分頁開啟
echo.
set /p choice="請輸入選項 [1 或 2，預設 1]: "
if "%choice%"=="2" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1"
) else (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" -Desktop
)

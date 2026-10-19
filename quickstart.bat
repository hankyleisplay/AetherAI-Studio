@echo off
chcp 65001 >nul
title Aether AI Studio 3.5 QuickStart
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0quickstart.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] 執行中斷，錯誤代碼: %ERRORLEVEL%
    pause
)

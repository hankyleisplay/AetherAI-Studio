@echo off
setlocal
chcp 65001 >nul 2>&1
title Aether AI Studio 3.5 QuickStart

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0quickstart.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [!] 執行中斷，錯誤代碼: %ERRORLEVEL%
    pause
)

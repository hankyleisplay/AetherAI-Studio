@echo off
setlocal
chcp 65001 >nul 2>&1
title Aether AI Studio 4.0 - 系統更新程式

echo ==============================================================
echo          Aether AI Studio 4.0 (AetherAgent) 系統更新程式
echo ==============================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1"

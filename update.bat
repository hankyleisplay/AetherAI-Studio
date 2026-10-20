@echo off
setlocal
chcp 65001 >nul 2>&1
title Aether AI Studio 3.5 - 系統更新程式

echo ==============================================================
echo          Aether AI Studio 3.5 (AetherAgent) 系統更新程式
echo ==============================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; Get-ChildItem -Path '%~dp0' -Filter '*.ps1' -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue; & '%~dp0update.ps1'"

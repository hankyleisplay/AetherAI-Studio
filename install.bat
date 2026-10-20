@echo off
setlocal
chcp 65001 >nul 2>&1
title Aether AI Studio 3.5 Installer

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='SilentlyContinue'; Get-ChildItem -Path '%~dp0' -Filter '*.ps1' -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue; & '%~dp0install.ps1' %*"

if %ERRORLEVEL% NEQ 0 pause

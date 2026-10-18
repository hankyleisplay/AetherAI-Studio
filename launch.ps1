# ==========================================================================
# Aether AI Studio 3.0 - Interactive Quickstart Launcher
# ==========================================================================

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Clear-Host
Write-Host ""
Write-Host " ==============================================================" -ForegroundColor Cyan
Write-Host "          Aether AI Studio 3.0 (AetherAgent) 啟動導航" -ForegroundColor Cyan
Write-Host "    Liquid Glass 3.0 - Next-Gen Desktop Autonomous AI Agent" -ForegroundColor DarkCyan
Write-Host " ==============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "請選擇您要啟動的模式：" -ForegroundColor Yellow
Write-Host "  [1] 獨立桌面視窗版 (Desktop App) - 原生獨立視窗、沉浸極簡體驗 (推薦)" -ForegroundColor White
Write-Host "  [2] 一般網頁瀏覽器版 (Web Browser) - 自動於預設瀏覽器分頁開啟" -ForegroundColor White
Write-Host ""
$choice = Read-Host "請輸入選項 [1 或 2，預設 1]"

if ($choice -eq "2") {
    & powershell -NoProfile -ExecutionPolicy Bypass -File "$ScriptDir\run.ps1"
} else {
    & powershell -NoProfile -ExecutionPolicy Bypass -File "$ScriptDir\run.ps1" -Desktop
}

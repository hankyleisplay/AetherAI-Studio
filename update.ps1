# Automatically unblock all scripts in current repository to eliminate digital signature warnings on Windows
Get-ChildItem -Path $PSScriptRoot -Filter *.ps1 -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue
﻿# ==========================================================================
# Aether AI Studio 3.0 - Automatic One-Click Updater
# ==========================================================================

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Clear-Host
Write-Host ""
Write-Host " ==============================================================" -ForegroundColor Cyan
Write-Host "          Aether AI Studio 3.0 (AetherAgent) 系統更新程式" -ForegroundColor Cyan
Write-Host "    Liquid Glass 3.0 - Next-Gen Desktop Autonomous AI Agent" -ForegroundColor DarkCyan
Write-Host " ==============================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check Git
Write-Host "[1/4] 檢查 Git 環境與遠端版本..." -ForegroundColor Cyan
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host " [X] 系統未安裝 Git 命令列工具，無法自動拉取更新。" -ForegroundColor Red
    Write-Host "     請至 https://git-scm.com/ 下載安裝 Git 後重試。" -ForegroundColor Yellow
    exit 1
}

$isGitRepo = git rev-parse --is-inside-work-tree 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host " [X] 當前目錄不是 Git 儲存庫，無法執行更新。" -ForegroundColor Red
    exit 1
}

# 2. Fetch remote and sync code
Write-Host "[2/4] 正在檢查 GitHub 遠端更新..." -ForegroundColor Cyan
git fetch origin main 2>$null

$localHash = git rev-parse HEAD 2>$null
$remoteHash = git rev-parse origin/main 2>$null

if ($localHash -and $remoteHash -and ($localHash -eq $remoteHash)) {
    Write-Host " [+] 您的 Aether AI Studio 已經是最新版本！(Commit: $($localHash.Substring(0,7)))" -ForegroundColor Green
} else {
    Write-Host " [!] 發現新版本！正在保護本機資料並同步最新程式碼..." -ForegroundColor Yellow
    # Stash any local uncommitted files to prevent git pull conflict
    git stash --include-untracked >$null 2>&1
    git pull origin main
    git stash pop >$null 2>&1
    Write-Host " [+] 程式碼已成功更新至最新版！" -ForegroundColor Green
}

# 3. Check and update Python dependencies
Write-Host "[3/4] 檢查後端依賴套件是否需要更新..." -ForegroundColor Cyan
$pythonExe = $null
$candidates = @("python", "py", "python3")
foreach ($name in $candidates) {
    $cmdInfo = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmdInfo -and $cmdInfo.Source -and ($cmdInfo.Source -notlike "*\WindowsApps\*")) {
        $pythonExe = $cmdInfo.Source
        break
    }
}

if ($pythonExe) {
    $reqFile = Join-Path $ScriptDir "backend\requirements.txt"
    if (Test-Path $reqFile) {
        Write-Host " [+] 確保最新後端相依套件已就緒..." -ForegroundColor Green
        & $pythonExe -m pip install -r $reqFile --quiet
        if ($LASTEXITCODE -ne 0) {
            & $pythonExe -m pip install --user -r $reqFile --quiet
        }
    }
}

# 4. Prompt to Launch
Write-Host "[4/4] 更新完成！" -ForegroundColor Green
Write-Host ""
Write-Host "請選擇是否立即啟動 Aether AI Studio 3.0：" -ForegroundColor Yellow
Write-Host "  [1] 獨立桌面視窗版 (Desktop App) - 推薦" -ForegroundColor White
Write-Host "  [2] 一般網頁瀏覽器版 (Web Browser)" -ForegroundColor White
Write-Host "  [3] 暫不啟動，結束程式" -ForegroundColor White
Write-Host ""
$launchChoice = Read-Host "請輸入選項 [1-3，預設 1]"

if ($launchChoice -eq "2") {
    & powershell -NoProfile -ExecutionPolicy Bypass -File "$ScriptDir\run.ps1"
} elseif ($launchChoice -eq "3") {
    Write-Host "感謝使用 Aether AI Studio 3.0！隨時可執行 .\launch.bat 啟動。" -ForegroundColor Cyan
} else {
    & powershell -NoProfile -ExecutionPolicy Bypass -File "$ScriptDir\run.ps1" -Desktop
}

# Automatically unblock all scripts in current repository to eliminate digital signature warnings on Windows
Get-ChildItem -Path $PSScriptRoot -Filter *.ps1 -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue
# ==============================================================================
# Aether AI Studio 3.5 (AetherAgent) - 智慧極速安裝與啟動腳本
# 自動處理 Clone / Pull 更新，並主動詢問使用者啟動【原生桌面版】或【一般瀏覽器版】
# ==============================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
if (Get-Command chcp.com -ErrorAction SilentlyContinue) {
    & chcp.com 65001 >$null 2>&1
}

$RepoUrl = "https://github.com/hankyleisplay/AetherAI-Studio.git"
$Branch = "v3.5-experimental"
$TargetFolder = "AetherAI-Studio"

Write-Host ""
Write-Host " ==============================================================" -ForegroundColor Cyan
Write-Host "          Aether AI Studio 3.5 (AetherAgent) Preview           " -ForegroundColor Cyan
Write-Host "   次世代獨立原生桌面版 • 實時推論 HUD • 即時畫布 • 22 大工具鏈   " -ForegroundColor DarkCyan
Write-Host " ==============================================================" -ForegroundColor Cyan
Write-Host ""

# 1. 智慧檢查與更新機制（防止 destination path already exists 錯誤）
if (Test-Path ".\run.ps1") {
    Write-Host " [*] 當前已在 Aether AI Studio 專案根目錄中。" -ForegroundColor Green
    if (Get-Command git -ErrorAction SilentlyContinue) {
        Write-Host " [*] 正在檢查並拉取最新 $Branch 實驗預覽版本更新..." -ForegroundColor Yellow
        git pull origin $Branch
    }
} elseif (Test-Path $TargetFolder) {
    Write-Host " [*] 檢測到已存在 $TargetFolder 專案目錄，進入並更新至最新 $Branch 版本..." -ForegroundColor Yellow
    Push-Location $TargetFolder
    if (Get-Command git -ErrorAction SilentlyContinue) {
        git fetch origin
        git checkout $Branch
        git pull origin $Branch
    }
} else {
    Write-Host " [*] 正在從 GitHub 克隆 Aether AI Studio 3.5 實驗預覽版儲存庫..." -ForegroundColor Green
    if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
        Write-Host " [❌ 錯誤] 未檢測到 Git 指令，請先安裝 Git (https://git-scm.com/) 後重試。" -ForegroundColor Red
        pause
        exit 1
    }
    git clone -b $Branch $RepoUrl $TargetFolder
    if ($LASTEXITCODE -ne 0) {
        Write-Host " [❌ 錯誤] 克隆儲存庫失敗，請確認網路連線。" -ForegroundColor Red
        pause
        exit $LASTEXITCODE
    }
    Push-Location $TargetFolder
}

# 2. 主動詢問使用者啟動模式
Write-Host ""
Write-Host " ==============================================================" -ForegroundColor Cyan
Write-Host " 請選擇 Aether AI Studio 3.5 啟動模式：" -ForegroundColor Yellow
Write-Host "  [1] 🖥️  獨立原生桌面版 (Standalone Desktop App) - [推薦，沉浸無分頁干擾]" -ForegroundColor Green
Write-Host "  [2] 🌐  一般瀏覽器版 (Web Browser Mode)" -ForegroundColor Cyan
Write-Host " ==============================================================" -ForegroundColor Cyan
Write-Host ""

$choice = Read-Host "請輸入選項 [1/2] (直接按 Enter 預設為桌面版 1)"

if ([string]::IsNullOrWhiteSpace($choice) -or $choice.Trim() -eq "1") {
    Write-Host ""
    Write-Host " [✓] 正在為您啟動 Aether AI Studio 3.5 獨立原生桌面版..." -ForegroundColor Green
    powershell -NoProfile -ExecutionPolicy Bypass -Command "& { Get-ChildItem -Path . -Filter '*.ps1' -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue; & .\run.ps1 -Desktop }"
} elseif ($choice.Trim() -eq "2") {
    Write-Host ""
    Write-Host " [✓] 正在為您啟動 Aether AI Studio 3.5 一般瀏覽器版..." -ForegroundColor Cyan
    powershell -NoProfile -ExecutionPolicy Bypass -Command "& { Get-ChildItem -Path . -Filter '*.ps1' -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue; & .\run.ps1 }"
} else {
    Write-Host ""
    Write-Host " [!] 輸入未辨識，預設為您啟動獨立原生桌面版..." -ForegroundColor Yellow
    powershell -NoProfile -ExecutionPolicy Bypass -Command "& { Get-ChildItem -Path . -Filter '*.ps1' -Recurse -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue; & .\run.ps1 -Desktop }"
}

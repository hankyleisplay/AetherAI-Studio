# ==========================================================================
# AetherAI Studio 2.0 (AetherAgent) - Windows Installer
# Automated Setup for Python, Dependencies, Frontend & Desktop Shortcut
# ==========================================================================

$ErrorActionPreference = "Stop"

Clear-Host
Write-Host ""
Write-Host " ╔══════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host " ║      AetherAI Studio 2.0 (AetherAgent) 自動安裝精靈          ║" -ForegroundColor Cyan
Write-Host " ╚══════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Step 1: Detect Python
Write-Host "[1/4] 檢查 Python 執行環境..." -ForegroundColor Cyan
$pythonCmd = $null
if (Get-Command python3 -ErrorAction SilentlyContinue) {
    $pythonCmd = "python3"
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonCmd = "py -3"
}

if (-not $pythonCmd) {
    Write-Host " [!] 找不到 Python。正在嘗試透過 winget 自動安裝 Python 3.12..." -ForegroundColor Yellow
    try {
        winget install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
        $pythonCmd = "python"
    } catch {
        Write-Host "❌ 自動安裝失敗，請至 https://www.python.org/downloads/ 安裝 Python 3.10 或以上版本。" -ForegroundColor Red
        exit 1
    }
}
Write-Host " [+] Python 偵測就緒。" -ForegroundColor Green

# Step 2: Install Backend Packages
Write-Host "[2/4] 安裝後端核心依賴套件..." -ForegroundColor Cyan
$reqPath = Join-Path $ScriptDir "backend\requirements.txt"
& $pythonCmd -m pip install -r $reqPath
Write-Host " [+] 後端依賴安裝完成。" -ForegroundColor Green

# Step 3: Build Frontend
Write-Host "[3/4] 檢查與建置 Liquid Glass 前端介面..." -ForegroundColor Cyan
$distIndex = Join-Path $ScriptDir "frontend\dist\index.html"
if (-not (Test-Path $distIndex)) {
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        Write-Host " [>] 正在安裝 npm 套件並建置生產環境產物..." -ForegroundColor Cyan
        Set-Location (Join-Path $ScriptDir "frontend")
        npm install --no-bin-links
        npm run build
        Set-Location $ScriptDir
        Write-Host " [+] 前端 SPA 建置成功！" -ForegroundColor Green
    } else {
        Write-Host " ⚠️ 未偵測到 Node.js，若需要自行編譯前端請安裝 Node.js。" -ForegroundColor Yellow
    }
} else {
    Write-Host " [+] 前端產物已存在。" -ForegroundColor Green
}

# Step 4: Create Desktop Shortcut
Write-Host "[4/4] 建立 Windows 桌面捷徑..." -ForegroundColor Cyan
try {
    $desktopPath = [System.Environment]::GetFolderPath("Desktop")
    $shortcutFile = Join-Path $desktopPath "AetherAI Studio 2.0.lnk"
    $wscriptShell = New-Object -ComObject WScript.Shell
    $shortcut = $wscriptShell.CreateShortcut($shortcutFile)
    $shortcut.TargetPath = "powershell.exe"
    $shortcut.Arguments = "-NoExit -ExecutionPolicy Bypass -File `"$ScriptDir\run.ps1`""
    $shortcut.WorkingDirectory = $ScriptDir
    $shortcut.Description = "啟動 AetherAI Studio 2.0 (AetherAgent)"
    $shortcut.Save()
    Write-Host " [+] 桌面捷徑已建立：$shortcutFile" -ForegroundColor Green
} catch {
    Write-Host " [!] 建立捷徑失敗 (可手動執行 run.ps1 啟動)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 AetherAI Studio 2.0 安裝程序完成！" -ForegroundColor Green
Write-Host "👉 您可以隨時透過雙擊桌面的「AetherAI Studio 2.0」捷徑，或在終端機執行 .\run.ps1 啟動系統。" -ForegroundColor Cyan
Write-Host ""

# ==========================================================================
# AetherAI Studio 2.0 (AetherAgent) - Windows Installer
# Automated Setup for Python, Dependencies, Frontend & Desktop Shortcut
# ==========================================================================

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Clear-Host
Write-Host ""
Write-Host " ==============================================================" -ForegroundColor Cyan
Write-Host "      AetherAI Studio 2.0 (AetherAgent) 自動安裝精靈" -ForegroundColor Cyan
Write-Host " ==============================================================" -ForegroundColor Cyan
Write-Host ""

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

function Find-PythonExe {
    $candidates = @("python", "py", "python3")
    foreach ($name in $candidates) {
        $cmdInfo = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmdInfo -and $cmdInfo.Source -and ($cmdInfo.Source -notlike "*\WindowsApps\*")) {
            try {
                $prevEAP = $ErrorActionPreference
                $ErrorActionPreference = "Continue"
                & $cmdInfo.Source -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >$null 2>&1
                $code = $LASTEXITCODE
                $ErrorActionPreference = $prevEAP
                if ($code -eq 0) {
                    return $cmdInfo.Source
                }
            } catch {
                $ErrorActionPreference = "Stop"
            }
        }
    }
    return $null
}

# Step 1: Detect Python
Write-Host "[1/4] 檢查 Python 執行環境..." -ForegroundColor Cyan
$pythonExe = Find-PythonExe

if (-not $pythonExe) {
    Write-Host " [!] 找不到可用的 Python (>= 3.10)。正在嘗試透過 winget 自動安裝 Python 3.12..." -ForegroundColor Yellow
    try {
        winget install Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements
        $pythonExe = Find-PythonExe
    } catch {
        Write-Host " [X] 自動安裝失敗，請至 https://www.python.org/downloads/ 安裝 Python 3.10 或以上版本。" -ForegroundColor Red
        exit 1
    }
}

if (-not $pythonExe) {
    Write-Host " [X] 找不到可用的 Python (>= 3.10)，請確認安裝時已勾選 Add Python to PATH。" -ForegroundColor Red
    exit 1
}

$pyVer = (& $pythonExe --version)
Write-Host " [+] Python 偵測就緒: $pyVer ($pythonExe)" -ForegroundColor Green

# Step 2: Install Backend Packages
Write-Host "[2/4] 安裝後端核心依賴套件..." -ForegroundColor Cyan
$reqPath = Join-Path $ScriptDir "backend\requirements.txt"
$sitePackages = Join-Path $ScriptDir "backend\site-packages"
& $pythonExe -m pip install --target $sitePackages -r $reqPath
if ($LASTEXITCODE -ne 0) {
    Write-Host " [!] --target 安裝返回非零狀態，嘗試標準 pip 安裝..." -ForegroundColor Yellow
    & $pythonExe -m pip install -r $reqPath
}
Write-Host " [+] 後端依賴安裝完成。" -ForegroundColor Green

# Step 3: Build Frontend
Write-Host "[3/4] 檢查與建置 Liquid Glass 前端介面..." -ForegroundColor Cyan
$distIndex = Join-Path $ScriptDir "frontend\dist\index.html"
if (-not (Test-Path $distIndex)) {
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        Write-Host " [>] 正在安裝 npm 套件並建置生產環境產物..." -ForegroundColor Cyan
        Push-Location (Join-Path $ScriptDir "frontend")
        try {
            npm install
            npm run build
            Write-Host " [+] 前端 SPA 建置成功！" -ForegroundColor Green
        } finally {
            Pop-Location
        }
    } else {
        Write-Host " [!] 未偵測到 Node.js，若需要自行編譯前端請安裝 Node.js。" -ForegroundColor Yellow
    }
} else {
    Write-Host " [+] 前端產物已存在 (frontend/dist)。" -ForegroundColor Green
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
    Write-Host " [!] 建立捷徑失敗 (可手動執行 run.bat 或 .\run.ps1 啟動)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "AetherAI Studio 2.0 安裝程序完成！" -ForegroundColor Green
Write-Host "您可以隨時透過雙擊 run.bat、桌面的「AetherAI Studio 2.0」捷徑，或在終端機執行 .\run.ps1 啟動系統。" -ForegroundColor Cyan
Write-Host ""

# ==========================================================================
# Aether AI Studio 3.5 (AetherAgent) - Windows Universal Launcher
# Liquid Glass Aesthetics | Local & Cloud Dual-Mode Agent Framework
# ==========================================================================

param (
    [int]$Port = 8000,
    [string]$HostIP = "127.0.0.1",
    [switch]$Dev,
    [switch]$Check,
    [switch]$Desktop,
    [switch]$NoBrowser,
    [switch]$Help
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
if (Get-Command chcp.com -ErrorAction SilentlyContinue) {
    & chcp.com 65001 >$null 2>&1
}

# Title banner
if (-not $Check) {
    Clear-Host
}
Write-Host ""
Write-Host " ==============================================================" -ForegroundColor Cyan
Write-Host "          Aether AI Studio 3.5 (AetherAgent) Preview" -ForegroundColor Cyan
Write-Host "    Liquid Glass 3.5 - Next-Gen Desktop Autonomous AI Agent" -ForegroundColor DarkCyan
Write-Host " ==============================================================" -ForegroundColor Cyan
Write-Host ""

if ($Help) {
    Write-Host "使用說明 / Usage:" -ForegroundColor Yellow
    Write-Host "  .\run.ps1                   啟動 AetherAI 伺服器並開啟瀏覽器" -ForegroundColor White
    Write-Host "  .\run.ps1 -Desktop          以原生獨立桌面視窗模式啟動 (Aether AI Studio 3.5 桌面版)" -ForegroundColor White
    Write-Host "  .\run.ps1 -Port 8888        指定連接埠啟動 (預設: 8000)" -ForegroundColor White
    Write-Host "  .\run.ps1 -Dev              同時啟動 FastAPI 與 Vite 開發熱重載模式" -ForegroundColor White
    Write-Host "  .\run.ps1 -Check            執行全系統環境與 22 大工具健康診斷" -ForegroundColor White
    Write-Host "  .\run.ps1 -NoBrowser        啟動伺服器但不自動開啟瀏覽器" -ForegroundColor White
    Write-Host "  .\run.ps1 -Help             顯示此說明" -ForegroundColor White
    exit 0
}

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

# 1. Check Python
Write-Host "[1/5] 檢查 Python 執行環境..." -ForegroundColor Cyan
$pythonExe = Find-PythonExe

if (-not $pythonExe) {
    Write-Host " [X] 找不到可用的 Python (>= 3.10)！請安裝 Python 3.10 或以上版本：" -ForegroundColor Red
    Write-Host "     可執行: winget install Python.Python.3.12" -ForegroundColor Yellow
    Write-Host "     或造訪: https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

$pyVersion = (& $pythonExe --version)
Write-Host " [+] 偵測到 Python: $pyVersion ($pythonExe)" -ForegroundColor Green

# 2. Check Dependencies
Write-Host "[2/5] 檢查依賴環境與套件..." -ForegroundColor Cyan
$reqFile = Join-Path $ScriptDir "backend\requirements.txt"
$sitePackages = Join-Path $ScriptDir "backend\site-packages"

# Test if local site-packages is healthy and contains valid pydantic
$useSitePackages = $false
if (Test-Path (Join-Path $sitePackages "pydantic\__init__.py")) {
    $useSitePackages = $true
}

if ($useSitePackages) {
    $env:PYTHONPATH = "$sitePackages;$ScriptDir;$env:PYTHONPATH"
} else {
    $env:PYTHONPATH = "$ScriptDir;$env:PYTHONPATH"
}
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"

$prevEAP = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $pythonExe -c "import fastapi, uvicorn, httpx, sse_starlette, psutil; from pydantic import BaseModel; from pydantic_settings import BaseSettings" >$null 2>&1
$depCheckCode = $LASTEXITCODE
$ErrorActionPreference = $prevEAP

if ($depCheckCode -ne 0) {
    Write-Host " [!] 尚未安裝完整後端套件，正在自動執行安裝..." -ForegroundColor Yellow
    & $pythonExe -m pip install -r $reqFile
    if ($LASTEXITCODE -ne 0) {
        & $pythonExe -m pip install --user -r $reqFile
    }
} else {
    Write-Host " [+] 後端核心依賴就緒。" -ForegroundColor Green
}

# 3. Check Local AI (Ollama)
Write-Host "[3/5] 偵測本機 AI 模型服務 (Ollama)..." -ForegroundColor Cyan
$ollamaRunning = $false
try {
    $ollamaCheck = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -Method Get -TimeoutSec 2 -ErrorAction SilentlyContinue
    if ($ollamaCheck) {
        $ollamaRunning = $true
        $modelCount = if ($ollamaCheck.models) { $ollamaCheck.models.Count } else { 0 }
        Write-Host " [+] Ollama 運行中！已偵測到 $modelCount 個本地模型。" -ForegroundColor Green
    }
} catch {
    # Not running or not installed
}

if (-not $ollamaRunning) {
    if (Get-Command ollama -ErrorAction SilentlyContinue) {
        Write-Host " [i] Ollama 已安裝但尚未啟動。可執行 'ollama serve' 啟動服務。" -ForegroundColor Yellow
    } else {
        Write-Host " [i] 未偵測到 Ollama。若需本地離線推理，可至 https://ollama.com 安裝。" -ForegroundColor Gray
        Write-Host "     (您仍可在 Web 介面直接輸入 API Key 使用 OpenAI、Gemini、Claude、DeepSeek 或 Groq)" -ForegroundColor Gray
    }
}

# 4. Check Frontend Web SPA
Write-Host "[4/5] 檢查 Liquid Glass 前端介面..." -ForegroundColor Cyan
$distIndex = Join-Path $ScriptDir "frontend\dist\index.html"
if (Test-Path $distIndex) {
    Write-Host " [+] 前端 SPA 產物就緒 (frontend/dist)。" -ForegroundColor Green
} else {
    Write-Host " [!] 尚未建置前端，正在嘗試建置..." -ForegroundColor Yellow
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        Push-Location (Join-Path $ScriptDir "frontend")
        try {
            npm install
            npm run build
        } finally {
            Pop-Location
        }
    } else {
        Write-Host " [!] 未安裝 Node.js，無法自動編譯前端。請先安裝 Node.js 或執行 npm run build。" -ForegroundColor Yellow
    }
}

# 5. Launch or Run Check
if ($Check) {
    Write-Host "[5/5] 執行系統自我檢測..." -ForegroundColor Cyan
    & $pythonExe (Join-Path $ScriptDir "start.py") --check
    exit $LASTEXITCODE
}

Write-Host "[5/5] 啟動 Aether AI Studio 3.5 (AetherAgent)..." -ForegroundColor Green
$url = "http://${HostIP}:${Port}"
Write-Host ""
Write-Host " 伺服器正在啟動，訪問網址: $url" -ForegroundColor Cyan
Write-Host " 按 Ctrl+C 可隨時停止伺服器" -ForegroundColor Gray
Write-Host ""

$startArgs = @((Join-Path $ScriptDir "start.py"), "--port", "$Port", "--host", "$HostIP")
if ($Dev) {
    $startArgs += "--dev"
}
if ($Desktop) {
    $startArgs += "--desktop"
}
if ($NoBrowser) {
    $startArgs += "--no-browser"
}

& $pythonExe @startArgs

// ==========================================================================
// AetherAI Studio - Cross-Platform Build Compiler Script
// Compiles AetherAI-Studio-Portable.html and servers into run.ps1 and run.sh
// ==========================================================================

const fs = require('fs');
const path = require('path');
const pkg = require('./package.json');
const version = pkg.version;

const workspacePath = __dirname;
const portablePath = path.join(workspacePath, 'AetherAI-Studio-Portable.html');
const serverPsPath = path.join(workspacePath, 'server.ps1');
const serverJsPath = path.join(workspacePath, 'server.js');
const cliJsPath = path.join(workspacePath, 'cli.js');
const runPsPath = path.join(workspacePath, 'run.ps1');
const runShPath = path.join(workspacePath, 'run.sh');
const websiteRunPsPath = path.join(workspacePath, 'website', 'run.ps1');
const websiteRunShPath = path.join(workspacePath, 'website', 'run.sh');

if (!fs.existsSync(portablePath) || !fs.existsSync(serverPsPath) || !fs.existsSync(serverJsPath) || !fs.existsSync(cliJsPath)) {
  console.error("Required source files not found! Ensure AetherAI-Studio-Portable.html, server.ps1, server.js, and cli.js exist.");
  process.exit(1);
}

console.log("Reading and Base64-encoding source assets...");
const portableBase64 = fs.readFileSync(portablePath).toString('base64');
const serverPsBase64 = fs.readFileSync(serverPsPath).toString('base64');
const serverJsBase64 = fs.readFileSync(serverJsPath).toString('base64');
const cliJsBase64 = fs.readFileSync(cliJsPath).toString('base64');

// ==========================================================================
// 1. COMPILE WINDOWS: run.ps1
// ==========================================================================
console.log("Compiling run.ps1 for Windows...");

const psTemplate = `# ==========================================================================
# AetherAI Studio - Launcher (Pure PowerShell Edition)
# ==========================================================================
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force -ErrorAction SilentlyContinue; Set-ExecutionPolicy RemoteSigned -Scope LocalMachine -Force -ErrorAction SilentlyContinue

# ==========================================================================
# AUTOMATIC UPDATE CHECK
# ==========================================================================
$localVersion = "${version}"
Write-Host "Checking for AetherAI Studio updates..." -ForegroundColor Cyan

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $request = [System.Net.WebRequest]::Create("https://api.github.com/repos/hankyleisplay/AetherAI-Studio/releases/latest")
    $request.Timeout = 3000
    $request.UserAgent = "Mozilla/5.0"
    $request.Method = "GET"
    $response = $request.GetResponse()
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    $jsonStr = $reader.ReadToEnd()
    $reader.Close()
    $response.Close()
    
    if ($jsonStr -match '"tag_name":\\s*"([^"]+)"') {
        $remoteTag = $Matches[1]
        $remoteVersion = if ($remoteTag -match '^v?([0-9.]+.*)$') { $Matches[1] } else { $remoteTag }
        
        if ($remoteVersion -ne $localVersion) {
            Write-Host "New version $remoteVersion available! (Current local: $localVersion)" -ForegroundColor Green
            $scriptPath = $MyInvocation.MyCommand.Path
            if ($scriptPath -and (Test-Path $scriptPath) -and ($scriptPath -notlike "*temp*")) {
                Write-Host "Downloading update from GitHub Releases ($remoteTag)..." -ForegroundColor Yellow
                $updateUrl = "https://raw.githubusercontent.com/hankyleisplay/AetherAI-Studio/$remoteTag/run.ps1"
                try {
                    $webClient = New-Object System.Net.WebClient
                    $webClient.Headers.Add("User-Agent", "Mozilla/5.0")
                    $webClient.DownloadFile($updateUrl, $scriptPath)
                    Write-Host "Update installed successfully! Restarting launcher..." -ForegroundColor Green
                    
                    $shellName = if ($PSVersionTable.PSVersion.Major -ge 7) { "pwsh" } else { "powershell" }
                    $arguments = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $scriptPath)
                    if ($args) { $arguments += $args }
                    
                    Start-Process $shellName -ArgumentList $arguments
                    exit
                } catch {
                    Write-Host "⚠️ Failed to save update: $_" -ForegroundColor Yellow
                }
            } else {
                Write-Host "Running in-memory or temp execution. Bypassing script file overwrite." -ForegroundColor Gray
            }
        } else {
            Write-Host "AetherAI Studio is up to date (Version $localVersion)." -ForegroundColor Green
        }
    }
} catch {
    Write-Host "⚠️ Unable to check for updates (offline or GitHub Releases API unreachable)." -ForegroundColor Yellow
}

# ==========================================================================
# ADMINISTRATOR PRIVILEGE ELEVATION CHECK
# ==========================================================================
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    $scriptPath = $MyInvocation.MyCommand.Path
    if ($scriptPath -and (Test-Path $scriptPath)) {
        Write-Host "Requesting Administrator privileges to run AetherAI Studio..." -ForegroundColor Yellow
        $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $scriptPath)
        if ($args) { $argList += $args }
        $shellName = if ($PSVersionTable.PSVersion.Major -ge 7) { "pwsh" } else { "powershell" }
        try {
            Start-Process $shellName -ArgumentList $argList -Verb RunAs
            exit
        } catch {
            Write-Host "❌ Error: Administrator privileges are required to run this script." -ForegroundColor Red
            Write-Host "Please approve the UAC prompt or run PowerShell as Administrator." -ForegroundColor Yellow
            Write-Host "Press any key to exit..." -ForegroundColor Gray
            try { [void][System.Console]::ReadKey($true) } catch {}
            exit
        }
    }
}

$portableBase64 = "${portableBase64}"
$serverBase64 = "${serverPsBase64}"

# ==========================================================================
# SMART INSTALLER REDIRECTION CORE
# ==========================================================================
$tempDir = [System.IO.Path]::GetTempPath().TrimEnd('\\')
$scriptPath = $MyInvocation.MyCommand.Path
$scriptDirClean = ""

if ($scriptPath) {
    $scriptDirClean = [System.IO.Path]::GetDirectoryName($scriptPath).TrimEnd('\\')
} else {
    $scriptDirClean = $tempDir
}

$isTemp = $false
if ($scriptDirClean -like "*\\AppData\\Local\\Temp*" -or $scriptDirClean -like "*\\Windows\\Temp*" -or $scriptDirClean -eq $tempDir -or [string]::IsNullOrEmpty($scriptPath)) {
    $isTemp = $true
}

$permanentDir = "$env:UserProfile\\AetherAI-Studio"
if ($isTemp) {
    if (!(Test-Path $permanentDir)) {
        New-Item -ItemType Directory -Path $permanentDir -Force | Out-Null
    }
    
    $env:SCRIPT_DIR = $permanentDir + "\\"
    $targetScriptPath = Join-Path $permanentDir "run.ps1"
    
    if ($scriptPath -and (Test-Path $scriptPath)) {
        Copy-Item -Path $scriptPath -Destination $targetScriptPath -Force -ErrorAction SilentlyContinue | Out-Null
    } else {
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-RestMethod -Uri "https://hankyle.com/run.ps1" -OutFile $targetScriptPath -ErrorAction SilentlyContinue
        } catch {}
    }
    
    if (-not $isAdmin) {
        Write-Host "Requesting Administrator privileges to complete installation..." -ForegroundColor Yellow
        $argList = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $targetScriptPath)
        if ($args) { $argList += $args }
        $shellName = if ($PSVersionTable.PSVersion.Major -ge 7) { "pwsh" } else { "powershell" }
        try {
            Start-Process $shellName -ArgumentList $argList -Verb RunAs
            exit
        } catch {
            Write-Host "❌ Error: Administrator privileges are required to complete the installation." -ForegroundColor Red
            Write-Host "Please approve the UAC prompt or run PowerShell as Administrator." -ForegroundColor Yellow
            Write-Host "Press any key to exit..." -ForegroundColor Gray
            try { [void][System.Console]::ReadKey($true) } catch {}
            exit
        }
    }
    
    Set-Location -Path $permanentDir
    Write-Host "Smart Web Installer: Redirecting AetherAI Studio installation..." -ForegroundColor Cyan
    Write-Host "👉 Permanent folder: $permanentDir" -ForegroundColor Yellow
    Write-Host ""
} else {
    $env:SCRIPT_DIR = $scriptDirClean + "\\"
    Set-Location -Path $scriptDirClean
}

# ==========================================================================
# COMMAND LINE INTERFACE ARGUMENTS HANDLERS
# ==========================================================================
$flag = $args[0]

if ($flag -eq "--help" -or $flag -eq "-h" -or $flag -eq "/?") {
    Clear-Host
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "            AetherAI Studio CLI Usage Guide" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  Syntax / 語法:" -ForegroundColor White
    Write-Host "    aetherai [options]" -ForegroundColor Gray
    Write-Host "    run.ps1 [options]" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Options / 選項:" -ForegroundColor White
    Write-Host "    --onboard        Run system diagnostic & onboarding check" -ForegroundColor Cyan
    Write-Host "                     執行系統診斷與引導檢測" -ForegroundColor Gray
    Write-Host ""
    Write-Host "    --fix            Diagnose & fix common configuration, CORS, and port issues" -ForegroundColor Cyan
    Write-Host "                     診斷並修復常見的設定、CORS 與連接埠衝突問題" -ForegroundColor Gray
    Write-Host ""
    Write-Host "    --uninstall      Cleanly remove terminal command paths, shortcuts, and background tasks" -ForegroundColor Cyan
    Write-Host "                     清除已註冊的終端機指令、桌面捷徑與背景工作" -ForegroundColor Gray
    Write-Host ""
    Write-Host "    --help, -h, /?   Show this CLI command reference and options menu" -ForegroundColor Cyan
    Write-Host "                     顯示此指令說明與選單資訊" -ForegroundColor Gray
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "Press any key to exit..." -ForegroundColor Yellow
    try { [void][System.Console]::ReadKey($true) } catch {}
    exit
}

if ($flag -eq "--onboard") {
    Clear-Host
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "            AetherAI Studio Onboarding Guide" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Welcome to AetherAI! This onboarder will check your local system settings." -ForegroundColor White
    Write-Host ""
    
    # 1. Check Ollama
    Write-Host "[>] Checking local Ollama installation..." -ForegroundColor Cyan
    $ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
    $localOllamaPath = "$env:LocalAppData\\Programs\\Ollama\\ollama.exe"
    if ($ollamaCmd) {
        Write-Host " [+] Ollama is installed and available in system environment PATH." -ForegroundColor Green
    } elseif (Test-Path $localOllamaPath) {
        Write-Host " [+] Ollama is installed locally at: $localOllamaPath" -ForegroundColor Green
    } else {
        Write-Host " [!] Ollama not found. Run Aether normally to download and install Ollama." -ForegroundColor Yellow
    }
    
    # 2. Check Active Bridges
    Write-Host ""
    Write-Host "[>] Checking Messaging Bridges..." -ForegroundColor Cyan
    $configPath = Join-Path $env:SCRIPT_DIR "config.json"
    if (Test-Path $configPath) {
        $config = Get-Content $configPath | ConvertFrom-Json
        if ($config.telegram_token -and $config.telegram_chat_id) {
            Write-Host " [+] Telegram Bridge: CONFIGURED (Token: $($config.telegram_token.Substring(0, 5))...)" -ForegroundColor Green
            $job = Get-Job -Name "TelegramBridge" -ErrorAction SilentlyContinue
            if ($job) {
                Write-Host "     Status: ACTIVE (Running in background)" -ForegroundColor Green
            } else {
                Write-Host "     Status: INACTIVE (Run 'aether' to start server & bridges)" -ForegroundColor Yellow
            }
        } else {
            Write-Host " [!] Telegram Bridge: NOT CONFIGURED" -ForegroundColor Gray
        }
        
        if ($config.discord_webhook) {
            Write-Host " [+] Discord Broadcaster: CONFIGURED" -ForegroundColor Green
        } else {
            Write-Host " [!] Discord Broadcaster: NOT CONFIGURED" -ForegroundColor Gray
        }
    } else {
        Write-Host " [!] config.json not created yet. Run 'aether' to initialize." -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "Onboarding completed successfully. Type 'aether' to boot the application." -ForegroundColor Cyan
    Write-Host "Press any key to exit..." -ForegroundColor Yellow
    try { [void][System.Console]::ReadKey($true) } catch {}
    exit
}

if ($flag -eq "--fix") {
    Clear-Host
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "            AetherAI Studio Diagnoser & Fixer" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "[>] Diagnosing and fixing common problems..." -ForegroundColor Cyan
    Write-Host ""
    
    # 1. Fix Ollama CORS
    Write-Host "[>] Resetting Ollama served with wildcard CORS origins..." -ForegroundColor Cyan
    Stop-Process -Name "ollama" -Force -ErrorAction SilentlyContinue
    Stop-Process -Name "Ollama" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    $env:OLLAMA_ORIGINS = "*"
    $ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
    $localOllamaPath = "$env:LocalAppData\\Programs\\Ollama\\ollama.exe"
    if ($ollamaCmd) {
        Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
        Write-Host " [+] Ollama CORS restarted successfully." -ForegroundColor Green
    } elseif (Test-Path $localOllamaPath) {
        Start-Process -FilePath $localOllamaPath -ArgumentList "serve" -WindowStyle Hidden
        Write-Host " [+] Ollama CORS restarted successfully." -ForegroundColor Green
    } else {
        Write-Host " [!] Ollama not found. Skipping CORS fix." -ForegroundColor Yellow
    }
    
    # 2. Re-save BOM files
    Write-Host ""
    Write-Host "[>] Enforcing UTF-8 BOM encoding for compiler and scripts..." -ForegroundColor Cyan
    try {
        $serverPath = Join-Path $env:SCRIPT_DIR "server.ps1"
        if (Test-Path $serverPath) {
            $content = [System.IO.File]::ReadAllText($serverPath, [System.Text.Encoding]::UTF8)
            [System.IO.File]::WriteAllText($serverPath, $content, [System.Text.Encoding]::UTF8)
            Write-Host " [+] server.ps1 UTF-8 BOM verified." -ForegroundColor Green
        }
    } catch {
        Write-Host " [!] Failed to enforce encoding: $_" -ForegroundColor Yellow
    }
    
    # 3. Clean background jobs
    Write-Host ""
    Write-Host "[>] Clearing background bridges..." -ForegroundColor Cyan
    $jobs = Get-Job -Name "TelegramBridge" -ErrorAction SilentlyContinue
    if ($jobs) {
        Stop-Job -Name "TelegramBridge" -ErrorAction SilentlyContinue
        Remove-Job -Name "TelegramBridge" -Force -ErrorAction SilentlyContinue
        Write-Host " [+] Telegram Bridge background process stopped and cleared." -ForegroundColor Green
    } else {
        Write-Host " [+] No hung background jobs found." -ForegroundColor Green
    }
    
    # 4. Check Port 8080 conflict
    Write-Host ""
    Write-Host "[>] Port conflict check..." -ForegroundColor Cyan
    $portActive = Get-NetTCPConnection -LocalPort 8080 -ErrorAction SilentlyContinue
    if ($portActive) {
        Write-Host " [!] Warning: Port 8080 is currently occupied. AetherAI web server will automatically bind to the next available port." -ForegroundColor Yellow
    } else {
        Write-Host " [+] Port 8080 is free and available." -ForegroundColor Green
    }
    
    Write-Host ""
    Write-Host "All diagnoses and fixes completed successfully!" -ForegroundColor Green
    Write-Host "Press any key to exit..." -ForegroundColor Yellow
    try { [void][System.Console]::ReadKey($true) } catch {}
    exit
}

if ($flag -eq "--uninstall") {
    Clear-Host
    Write-Host "==========================================================" -ForegroundColor Red
    Write-Host "            AetherAI Studio Clean Uninstaller" -ForegroundColor Red
    Write-Host "==========================================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Warning: This action will permanently remove AetherAI Studio terminal commands, Desktop shortcuts, and local environment variables." -ForegroundColor Yellow
    Write-Host "Press [Y] to confirm uninstall, or any other key to abort..." -ForegroundColor Yellow
    
    $confirm = [System.Console]::ReadKey($true).KeyChar
    if ($confirm -eq 'y' -or $confirm -eq 'Y') {
        Write-Host ""
        Write-Host "[>] Stopping background bridges..." -ForegroundColor Cyan
        Stop-Job -Name "TelegramBridge" -ErrorAction SilentlyContinue
        Remove-Job -Name "TelegramBridge" -Force -ErrorAction SilentlyContinue
        
        Write-Host "[>] Removing global Desktop shortcuts..." -ForegroundColor Cyan
        $shortcutPath = [System.IO.Path]::Combine([Environment]::GetFolderPath("Desktop"), "AetherAI Studio.lnk")
        if (Test-Path $shortcutPath) {
            Remove-Item $shortcutPath -Force -ErrorAction SilentlyContinue
            Write-Host " [+] Desktop shortcut removed." -ForegroundColor Green
        }
        
        Write-Host "[>] Removing global Windows terminal command PATH variables..." -ForegroundColor Cyan
        try {
            $userPath = [Environment]::GetEnvironmentVariable("Path", [EnvironmentVariableTarget]::User)
            $cleanScriptDir = $env:SCRIPT_DIR.TrimEnd('\\')
            if ($userPath -like "*$cleanScriptDir*") {
                $paths = $userPath.Split(';') | Where-Object { $_ -ne $cleanScriptDir -and $_ -ne "" }
                $newPath = $paths -join ";"
                [Environment]::SetEnvironmentVariable("Path", $newPath, [EnvironmentVariableTarget]::User)
                Write-Host " [+] Workspace directory removed from user PATH environment variable." -ForegroundColor Green
            }
        } catch {
            Write-Host " [!] Failed to remove environment variable: $_" -ForegroundColor Yellow
        }
        
        Write-Host "[>] Cleaning up local command batch wrappers..." -ForegroundColor Cyan
        $cmdPath = [System.IO.Path]::Combine($env:SCRIPT_DIR, "aether.cmd")
        $cmdPath2 = [System.IO.Path]::Combine($env:SCRIPT_DIR, "aetherai.cmd")
        Remove-Item $cmdPath -Force -ErrorAction SilentlyContinue
        Remove-Item $cmdPath2 -Force -ErrorAction SilentlyContinue
        
        Write-Host ""
        Write-Host "🎉 AetherAI Studio has been successfully uninstalled from your terminal and shortcuts!" -ForegroundColor Green
        Write-Host "The workspace folder remains intact. You can manually delete it if desired." -ForegroundColor White
    } else {
        Write-Host ""
        Write-Host "Uninstall aborted." -ForegroundColor Green
    }
    Write-Host "Press any key to exit..." -ForegroundColor Yellow
    try { [void][System.Console]::ReadKey($true) } catch {}
    exit
}

Clear-Host

# Interactive Language Selection Prompt
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "            AetherAI Studio Setup Launcher" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Please select your language / 請選擇語言:" -ForegroundColor White
Write-Host "   [1] 繁體中文 (Traditional Chinese)" -ForegroundColor Gray
Write-Host "   [2] English" -ForegroundColor Gray
Write-Host ""
Write-Host "  Please press [1] or [2] / 請按 [1] 或 [2] 鍵..." -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

$key = ' '
try { $key = [System.Console]::ReadKey($true).KeyChar } catch {}
$lang = "en"
if ($key -eq '1') {
    $lang = "zh-TW"
} elseif ($key -eq '2') {
    $lang = "en"
} else {
    $sysLang = [System.Globalization.CultureInfo]::CurrentUICulture.Name
    if ($sysLang -like "zh*") {
        $lang = "zh-TW"
    }
}

Clear-Host

$dict = @{
    "zh-TW" = @{
        "title" = "                 AetherAI Studio 一鍵安裝與啟動工具";
        "intro" = "感謝您使用 AetherAI Studio！本工具將自動協助您：";
        "step1" = " 1. 部署與還原所有網頁、樣式與腳本主程式";
        "step2" = " 2. 偵測並引導安裝 Ollama 本機 AI 服務";
        "step3" = " 3. 自動重啟 Ollama 並開啟跨域 (CORS) 存取權限";
        "step4" = " 4. 在您的 Windows 桌面建立快速啟動捷徑";
        "step5" = " 5. 啟動本機伺服器並自動開啟網頁 UI 介面";
        "extracting" = "[>] 正在還原並部署 AetherAI Studio 主程式網頁與服務元件...";
        "extracted_html" = " [+] 主程式網頁 index.html 生成成功！";
        "extracted_server" = " [+] 本機伺服器腳本 server.ps1 生成成功！";
        "fail_html" = " [!] index.html 生成失敗，請確認資料夾寫入權限！";
        "fail_server" = " [!] server.ps1 生成失敗！";
        "exit_prompt" = " 按任意鍵退出...";
        "detecting_ollama" = "[>] 正在偵測 Ollama 本機 AI 服務...";
        "ollama_env" = " [+] 偵測到 Ollama 已安裝於系統環境變數中。";
        "ollama_local" = " [+] 偵測到 Ollama 安裝於：";
        "ollama_missing" = " [!] 未在您的系統中偵測到 Ollama。";
        "connecting" = " [+] 正在連線至官方伺服器下載 Ollama...";
        "downloading" = " [>] 正在下載 Ollama 安裝程式... ";
        "download_success" = " [+] 下載完成！";
        "download_fail" = " [!] 下載失敗：";
        "ollama_installing" = " [+] 正在啟動 Ollama 安裝精靈，請按照畫面引導完成安裝...";
        "ollama_fail" = " [!] 下載或安裝失敗，請手動至官網安裝 Ollama: https://ollama.com";
        "setting_cors" = "[>] 正在重設 Ollama 以開啟跨域 (CORS) 存取通道...";
        "cors_note" = " 備註：此步驟能讓網頁介面順利與本機 AI 通訊。";
        "cors_success" = " [+] Ollama 跨域連線配置成功！已在背景啟動服務。";
        "cors_fail" = " [!] 啟動 Ollama 服務失敗，請確認您的權限或防火牆設定！";
        "creating_shortcut" = "[>] 正在為您在 Windows 桌面建立啟動捷徑...";
        "shortcut_desc" = "啟動 AetherAI Studio";
        "shortcut_success" = " [+] 捷徑建立完成！您未來可以直接雙擊桌面的「AetherAI Studio」捷徑啟動。";
        "shortcut_fail" = " [!] 建立桌面捷徑失敗，但主程式仍可正常執行。";
        "registering_cmd" = "[>] 正在為您在 Windows 終端機中註冊全域啟動指令 'aetherai'... ";
        "register_success" = " [+] 終端機指令註冊成功！您未來可以在任意 CMD/PowerShell 視窗中直接輸入「aetherai」啟動本機 AI 終端。";
        "register_fail" = " [!] 註冊終端機指令失敗，但捷徑與服務功能仍可正常運作。";
        "opening_browser" = "[>] 正在啟動 AetherAI Studio 網頁介面...";
        "loading_server" = "[>] 正在載入本地網頁伺服器...";
        "server_fail" = " [!] 本地伺服器異常中斷：";
        "congrats" = "🎉 恭喜！AetherAI Studio 已成功部署並啟動！";
        "url_msg" = "🌐 瀏覽器已自動為您開啟網頁 UI 介面";
        "guide_title" = "🖥️ 【下一步引導 / 您可以這樣做】：";
        "guide_o1" = "  1. 本機 AI (Ollama)：";
        "guide_o2" = "     - 本軟體已自動在背景啟動 Ollama 並開啟跨域存取 (OLLAMA_ORIGINS=*)。";
        "guide_o3" = "     - 請在網頁右側控制面板的「模型來源」中，選擇「Ollama」。";
        "guide_o4" = "     - 點選「模型名稱」選單，系統會自動載入已下載的模型，狀態顯示為 🟢 連線成功！";
        "guide_o5" = "     - 若無本機模型，可在控制面板的「本機下載模型」輸入欄中輸入（如 llama3）點選下載。";
        "guide_c1" = "  2. 智能代理 (Agent Code 模式)：";
        "guide_c2" = "     - 請在控制面板選擇「Agent Code」，AI 將可自主執行命令並管理工作區檔案！";
        "guide_s1" = "  3. 桌面捷徑：";
        "guide_s2" = "     - 您的桌面已建立「AetherAI Studio」捷徑，未來雙擊該捷徑即可直接啟動！";
        "guide_close" = "  4. 關閉軟體：直接關閉本命令提示字元 (CMD) 視窗，即可安全關閉本機伺服器。";
        "guide_cli" = '  5. 更多 CLI 指令：您可在終端機執行 \`\`aetherai --help\`\` 查看所有維護/診斷選項（例如修復 CORS、解除安裝等）。';
        "ollama_prompt_title" = "  請選擇您的 AI 模型供應商 / Preferred AI Provider:";
        "ollama_opt_1" = "   [1] 下載並安裝 Ollama 本機服務 (推薦，全自動下載)";
        "ollama_opt_2" = "   [2] 使用 LM Studio (請自行下載並在連接埠 1234 啟動 API 伺服器)";
        "ollama_opt_3" = "   [3] 使用 vLLM / 其它 OpenAI 相容 API (手動於控制面板設定 API 位址)";
        "ollama_opt_4" = "   [4] 暫時跳過 / 稍後設定 (稍後可在網頁介面中自訂來源)";
        "ollama_prompt_input" = "  請按 [1], [2], [3] 或 [4] 鍵選擇供應商...";
        "ollama_skip_msg" = " [+] 已選擇手動配置或使用其它供應商。跳過 Ollama 下載與安裝。";
    };
    "en" = @{
        "title" = "                 AetherAI Studio One-Click Launcher";
        "intro" = "Thank you for using AetherAI Studio! This launcher will automatically:";
        "step1" = " 1. Extract and restore all web pages, styles, and script assets";
        "step2" = " 2. Detect and guide the installation of the local Ollama AI service";
        "step3" = " 3. Restart Ollama with wildcard Cross-Origin Resource Sharing (CORS)";
        "step4" = " 4. Create a convenient startup shortcut on your Windows desktop";
        "step5" = " 5. Start the local server and automatically open the Web UI";
        "extracting" = "[>] Restoring and deploying AetherAI Studio files...";
        "extracted_html" = " [+] Web UI file 'index.html' generated successfully!";
        "extracted_server" = " [+] Server script 'server.ps1' generated successfully!";
        "fail_html" = " [!] Failed to generate index.html, check directory write permissions!";
        "fail_server" = " [!] Failed to generate server.ps1!";
        "exit_prompt" = " Press any key to exit...";
        "detecting_ollama" = "[>] Detecting local Ollama AI service...";
        "ollama_env" = " [+] Detected Ollama is installed in the system PATH.";
        "ollama_local" = " [+] Detected Ollama installed at: ";
        "ollama_missing" = " [!] Ollama was not found on your system.";
        "connecting" = " [+] Connecting to official server to download Ollama...";
        "downloading" = " [>] Downloading Ollama installer... ";
        "download_success" = " [+] Download complete!";
        "download_fail" = " [!] Download failed: ";
        "ollama_installing" = " [+] Launching Ollama Setup Wizard, please complete the installation...";
        "ollama_fail" = " [!] Download or installation failed. Please manually install Ollama from: https://ollama.com";
        "setting_cors" = "[>] Resetting Ollama configuration to open Cross-Origin (CORS)...";
        "cors_note" = " Note: This step allows the web interface to communicate with your local AI.";
        "cors_success" = " [+] Ollama CORS configured successfully! Service started in the background.";
        "cors_fail" = " [!] Failed to start Ollama service. Please check your system or firewall settings!";
        "creating_shortcut" = "[>] Creating a startup shortcut on your Windows Desktop...";
        "shortcut_desc" = "Launch AetherAI Studio";
        "shortcut_success" = " [+] Shortcut created successfully! Double-click 'AetherAI Studio' on your Desktop to launch.";
        "shortcut_fail" = " [!] Failed to create Desktop shortcut, but the main application runs normally.";
        "registering_cmd" = "[>] Registering global terminal command 'aetherai' in Windows PATH... ";
        "register_success" = " [+] Terminal command registered successfully! You can now type 'aetherai' in any terminal window to launch.";
        "register_fail" = " [!] Failed to register global terminal command, but shortcuts and services run normally.";
        "opening_browser" = "[>] Opening AetherAI Studio web interface...";
        "loading_server" = "[>] Loading local web server...";
        "server_fail" = " [!] Local web server stopped unexpectedly: ";
        "congrats" = "🎉 Congratulations! AetherAI Studio is successfully deployed!";
        "url_msg" = "🌐 Browser has automatically opened the Web UI";
        "guide_title" = "🖥️ [Next Steps & How-to Guide]:";
        "guide_o1" = "  1. Local AI (Ollama):";
        "guide_o2" = "     - Ollama is running in the background with CORS enabled (OLLAMA_ORIGINS=*).";
        "guide_o3" = "     - Select 'Ollama' as your Model Provider in the right-hand control panel.";
        "guide_o4" = "     - Click 'Model Name' dropdown to auto-load models. Connection status will turn 🟢 Online!";
        "guide_o5" = "     - If you don't have models, enter a model name (e.g. llama3) in the 'Download Local Model' box.";
        "guide_c1" = "  2. Intelligent Agent (Agent Code Mode):";
        "guide_c2" = "     - Select 'Agent Code' in the panel to let AI autonomously run terminal commands and manage files!";
        "guide_s1" = "  3. Desktop Shortcut:";
        "guide_s2" = "     - A shortcut named 'AetherAI Studio' has been created on your Windows Desktop for quick launch.";
        "guide_close" = "  4. Shutdown: Simply close this CMD window to safely shut down the local server.";
        "guide_cli" = '  5. Extra CLI Options: Run \`\`aetherai --help\`\` to access diagnostic/maintenance flags (like fixing CORS, clean uninstall, etc.).';
        "ollama_prompt_title" = "  Please select your AI provider / 請選擇您的 AI 供應商:";
        "ollama_opt_1" = "   [1] Download & Install Ollama local service (Recommended, fully automatic)";
        "ollama_opt_2" = "   [2] Use LM Studio (Download yourself and run API server on port 1234)";
        "ollama_opt_3" = "   [3] Use vLLM / Other OpenAI-compatible API (Configure API endpoints in Web UI)";
        "ollama_opt_4" = "   [4] Skip for now / Configure later (Manually set up source in control panel)";
        "ollama_prompt_input" = "  Please press [1], [2], [3] or [4] key to select a provider...";
        "ollama_skip_msg" = " [+] Chosen manual configuration or alternative provider. Skipping Ollama download.";
    }
}

$m = $dict[$lang]

Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host $m["title"] -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host $m["intro"] -ForegroundColor White
Write-Host $m["step1"] -ForegroundColor Gray
Write-Host $m["step2"] -ForegroundColor Gray
Write-Host $m["step3"] -ForegroundColor Gray
Write-Host $m["step4"] -ForegroundColor Gray
Write-Host $m["step5"] -ForegroundColor Gray
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Extract files from Base64
Write-Host $m["extracting"] -ForegroundColor Cyan

try {
    [System.IO.File]::WriteAllBytes("index.html", [System.Convert]::FromBase64String($portableBase64))
    Write-Host $m["extracted_html"] -ForegroundColor Green
} catch {
    Write-Host $m["fail_html"] -ForegroundColor Red
    Write-Host $m["exit_prompt"] -ForegroundColor Yellow
    [void][System.Console]::ReadKey($true)
    exit
}

try {
    [System.IO.File]::WriteAllBytes("server.ps1", [System.Convert]::FromBase64String($serverBase64))
    Write-Host $m["extracted_server"] -ForegroundColor Green
} catch {
    Write-Host $m["fail_server"] -ForegroundColor Red
    Write-Host $m["exit_prompt"] -ForegroundColor Yellow
    [void][System.Console]::ReadKey($true)
    exit
}

# 2. Check and Install Ollama
Write-Host ""
Write-Host $m["detecting_ollama"] -ForegroundColor Cyan
$ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
$localOllamaPath = "$env:LocalAppData\\Programs\\Ollama\\ollama.exe"
$ollamaPath = ""

if ($ollamaCmd) {
    $ollamaPath = "ollama"
    Write-Host $m["ollama_env"] -ForegroundColor Green
} elseif (Test-Path $localOllamaPath) {
    $ollamaPath = $localOllamaPath
    Write-Host ($m["ollama_local"] + $localOllamaPath) -ForegroundColor Green
} else {
    Write-Host $m["ollama_missing"] -ForegroundColor Yellow
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host $m["ollama_prompt_title"] -ForegroundColor White
    Write-Host $m["ollama_opt_1"] -ForegroundColor Gray
    Write-Host $m["ollama_opt_2"] -ForegroundColor Gray
    Write-Host $m["ollama_opt_3"] -ForegroundColor Gray
    Write-Host $m["ollama_opt_4"] -ForegroundColor Gray
    Write-Host ""
    Write-Host $m["ollama_prompt_input"] -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Cyan
    
    $providerKey = ' '
    try { $providerKey = [System.Console]::ReadKey($true).KeyChar } catch {}
    
    if ($providerKey -eq '1') {
        Write-Host ""
        Write-Host $m["connecting"] -ForegroundColor White
        
        $setupPath = "OllamaSetup.exe"
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            
            $request = [System.Net.HttpWebRequest]::Create("https://ollama.com/download/OllamaSetup.exe")
            $request.Timeout = 300000
            $response = $request.GetResponse()
            $totalBytes = $response.ContentLength
            $responseStream = $response.GetResponseStream()
            
            $targetStream = [System.IO.File]::Create($setupPath)
            $buffer = New-Object byte[] 65536
            $downloadedBytes = 0
            $progressBarWidth = 35
            
            $startCursorY = [System.Console]::CursorTop
            $startCursorX = [System.Console]::CursorLeft
            
            while (($read = $responseStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                $targetStream.Write($buffer, 0, $read)
                $downloadedBytes += $read
                
                if ($totalBytes -gt 0) {
                    $percent = ($downloadedBytes / $totalBytes) * 100
                    $filledWidth = [math]::Floor(($downloadedBytes / $totalBytes) * $progressBarWidth)
                    $unfilledWidth = $progressBarWidth - $filledWidth
                    
                    $bar = ("=" * $filledWidth) + ">" + (" " * $unfilledWidth)
                    if ($filledWidth -ge $progressBarWidth) {
                        $bar = "=" * $progressBarWidth
                    }
                    
                    $mbDownloaded = [math]::Round($downloadedBytes / 1MB, 1)
                    $mbTotal = [math]::Round($totalBytes / 1MB, 1)
                    
                    [System.Console]::SetCursorPosition(0, $startCursorY)
                    $statusText = "{0}[{1}] {2:N1}% ({3}MB / {4}MB)   " -f $m["downloading"], $bar, $percent, $mbDownloaded, $mbTotal
                    Write-Host $statusText -NoNewline -ForegroundColor Cyan
                } else {
                    $mbDownloaded = [math]::Round($downloadedBytes / 1MB, 1)
                    [System.Console]::SetCursorPosition(0, $startCursorY)
                    $statusText = "{0} ({1}MB downloaded)   " -f $m["downloading"], $mbDownloaded
                    Write-Host $statusText -NoNewline -ForegroundColor Cyan
                }
            }
            
            $responseStream.Close()
            $targetStream.Close()
            $response.Close()
            
            Write-Host ""
            Write-Host $m["download_success"] -ForegroundColor Green
            
            Write-Host $m["ollama_installing"] -ForegroundColor Green
            Start-Process -FilePath $setupPath -Wait
            Remove-Item $setupPath -Force -ErrorAction SilentlyContinue
            $ollamaPath = $localOllamaPath
        } catch {
            if ($targetStream) { $targetStream.Close() }
            if ($responseStream) { $responseStream.Close() }
            Write-Host ""
            Write-Host ($m["ollama_fail"] + " (" + $_.Exception.Message + ")") -ForegroundColor Red
            Write-Host $m["exit_prompt"] -ForegroundColor Yellow
            [void][System.Console]::ReadKey($true)
            exit
        }
    } else {
        Write-Host ""
        Write-Host $m["ollama_skip_msg"] -ForegroundColor Green
    }
}

# 3. Stop running Ollama process and restart with CORS Origins wildcard
if ($ollamaPath) {
    Write-Host ""
    Write-Host $m["setting_cors"] -ForegroundColor Cyan
    Write-Host $m["cors_note"] -ForegroundColor Gray
    
    Stop-Process -Name "ollama" -Force -ErrorAction SilentlyContinue
    Stop-Process -Name "Ollama" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    
    $env:OLLAMA_ORIGINS = "*"
    try {
        if ($ollamaPath -eq "ollama") {
            Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden
        } else {
            Start-Process -FilePath $ollamaPath -ArgumentList "serve" -WindowStyle Hidden
        }
        Write-Host $m["cors_success"] -ForegroundColor Green
    } catch {
        Write-Host $m["cors_fail"] -ForegroundColor Red
    }
}

# 4. Create Desktop Shortcut dynamically using COM object
Write-Host ""
Write-Host $m["creating_shortcut"] -ForegroundColor Cyan
try {
    $WshShell = New-Object -ComObject WScript.Shell
    $ShortcutPath = [System.IO.Path]::Combine([Environment]::GetFolderPath("Desktop"), "AetherAI Studio.lnk")
    $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
    $Shortcut.TargetPath = "pwsh.exe"
    $Shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File \`"$env:SCRIPT_DIR\\run.ps1\`""
    $Shortcut.WorkingDirectory = "$env:SCRIPT_DIR"
    $Shortcut.Description = $m["shortcut_desc"]
    $Shortcut.IconLocation = "shell32.dll, 13"
    $Shortcut.Save()
    Write-Host $m["shortcut_success"] -ForegroundColor Green
} catch {
    Write-Host $m["shortcut_fail"] -ForegroundColor Yellow
}

# 4.5 Register Global Terminal Command
Write-Host ""
Write-Host $m["registering_cmd"] -ForegroundColor Cyan
try {
    $scriptDir = $env:SCRIPT_DIR
    $cmdPath = [System.IO.Path]::Combine($scriptDir, "aetherai.cmd")
    $cmdPath2 = [System.IO.Path]::Combine($scriptDir, "aether.cmd")
    $cmdContent = "@echo off\`r\`npowershell -NoProfile -ExecutionPolicy Bypass -File \`"%~dp0run.ps1\`" %*"
    [System.IO.File]::WriteAllText($cmdPath, $cmdContent, [System.Text.Encoding]::ASCII)
    [System.IO.File]::WriteAllText($cmdPath2, $cmdContent, [System.Text.Encoding]::ASCII)

    # Add scriptDir to User Environment PATH if not already present
    $userPath = [Environment]::GetEnvironmentVariable("Path", [EnvironmentVariableTarget]::User)
    $cleanScriptDir = $scriptDir.TrimEnd('\\')
    if ($userPath -notlike "*$cleanScriptDir*") {
        $newPath = $userPath + ";" + $cleanScriptDir
        [Environment]::SetEnvironmentVariable("Path", $newPath, [EnvironmentVariableTarget]::User)
        
        $env:Path += ";" + $cleanScriptDir
    }
    Write-Host $m["register_success"] -ForegroundColor Green
} catch {
    Write-Host ($m["register_fail"] + " (" + $_.Exception.Message + ")") -ForegroundColor Yellow
}

# 5. Open Default Browser
Write-Host ""
Write-Host $m["opening_browser"] -ForegroundColor Cyan

# Print Interactive Multilingual Next Steps Guide
Write-Host ""
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host $m["congrats"] -ForegroundColor Green
Write-Host $m["url_msg"] -ForegroundColor White
Write-Host ""
Write-Host $m["guide_title"] -ForegroundColor White
Write-Host $m["guide_o1"] -ForegroundColor Cyan
Write-Host $m["guide_o2"] -ForegroundColor Gray
Write-Host $m["guide_o3"] -ForegroundColor Gray
Write-Host $m["guide_o4"] -ForegroundColor Gray
Write-Host $m["guide_o5"] -ForegroundColor Gray
Write-Host $m["guide_c1"] -ForegroundColor Cyan
Write-Host $m["guide_c2"] -ForegroundColor Gray
Write-Host $m["guide_s1"] -ForegroundColor Cyan
Write-Host $m["guide_s2"] -ForegroundColor Gray
Write-Host $m["guide_close"] -ForegroundColor Yellow
Write-Host $m["guide_cli"] -ForegroundColor Cyan
Write-Host "====================================================================" -ForegroundColor Cyan
Write-Host ""

# 6. Start Web Server in foreground
Write-Host $m["loading_server"] -ForegroundColor Cyan
try {
    & "$env:SCRIPT_DIR\\server.ps1"
} catch {
    Write-Host ""
    Write-Host ($m["server_fail"] + $_) -ForegroundColor Red
    Write-Host $m["exit_prompt"] -ForegroundColor Yellow
    [void][System.Console]::ReadKey($true)
}
`;

// Enforce strict Windows CRLF line endings
const crlfTemplate = psTemplate.replace(/\\n/g, "\\r\\n").replace(/\\r\\r\\n/g, "\\r\\n");

fs.writeFileSync(runPsPath, '\ufeff' + crlfTemplate, { encoding: 'utf8' });
fs.writeFileSync(websiteRunPsPath, '\ufeff' + crlfTemplate, { encoding: 'utf8' });
console.log("run.ps1 Compiled Successfully.");

// ==========================================================================
// 2. COMPILE MACOS/LINUX: run.sh
// ==========================================================================
console.log("Compiling run.sh for macOS/Linux...");

const shTemplate = `#!/bin/bash
# ==========================================================================
# AetherAI Studio - Launcher (macOS/Linux Shell Edition)
# ==========================================================================

# ==========================================================================
# AUTOMATIC UPDATE CHECK
# ==========================================================================
LOCAL_VERSION="${version}"
echo "Checking for AetherAI Studio updates..."
REMOTE_JSON=\$(curl -s --max-time 3 "https://api.github.com/repos/hankyleisplay/AetherAI-Studio/releases/latest")
if [ \$? -eq 0 ] && [ "\$REMOTE_JSON" != "" ]; then
    REMOTE_TAG=\$(echo "\$REMOTE_JSON" | grep -o '"tag_name":\\s*"[^"]*' | sed 's/.*"tag_name":\\s*"//')
    REMOTE_VERSION=\$(echo "\$REMOTE_TAG" | sed 's/^v//')
    if [ "\$REMOTE_VERSION" != "" ] && [ "\$REMOTE_VERSION" != "\$LOCAL_VERSION" ]; then
        echo "New version \$REMOTE_VERSION available! (Current local: \$LOCAL_VERSION)"
        SCRIPT_PATH="\$0"
        if [ -f "\$SCRIPT_PATH" ] && [ -w "\$SCRIPT_PATH" ] && [[ "\$SCRIPT_PATH" != *temp* ]]; then
            echo "Downloading update from GitHub Releases (\$REMOTE_TAG)..."
            curl -s --max-time 10 "https://raw.githubusercontent.com/hankyleisplay/AetherAI-Studio/\$REMOTE_TAG/run.sh" -o "\$SCRIPT_PATH"
            echo "Update installed successfully! Restarting launcher..."
            exec bash "\$SCRIPT_PATH" "\$@"
            exit 0
        fi
    else
        echo "AetherAI Studio is up to date (Version \$LOCAL_VERSION)."
    fi
fi

PERM_DIR="$HOME/AetherAI-Studio"

echo "===================================================================="
echo "                 AetherAI Studio Setup Launcher"
echo "===================================================================="
echo ""

# Create permanent folder
mkdir -p "$PERM_DIR"
cd "$PERM_DIR"

# Verify Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js is not installed on your system!"
    echo "Please install Node.js (version 18 or above) first to run the web app."
    echo "Visit: https://nodejs.org"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

echo "[>] Extracting and deploying AetherAI Studio files..."

# Decode files using Node.js programmatically to bypass base64 -d vs -D differences on macOS/Linux
node -e "
const fs = require('fs');
let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
    fs.writeFileSync('index.html', Buffer.from(data.trim(), 'base64'));
});
" << 'EOF'
${portableBase64}
EOF

node -e "
const fs = require('fs');
let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
    fs.writeFileSync('server.js', Buffer.from(data.trim(), 'base64'));
});
" << 'EOF'
${serverJsBase64}
EOF

node -e "
const fs = require('fs');
let data = '';
process.stdin.on('data', chunk => data += chunk);
process.stdin.on('end', () => {
    fs.writeFileSync('cli.js', Buffer.from(data.trim(), 'base64'));
});
" << 'EOF'
${cliJsBase64}
EOF


if [ $? -eq 0 ]; then
    echo "  ✅ Web UI file 'index.html' extracted successfully."
    echo "  ✅ Web Server file 'server.js' extracted successfully."
    echo "  ✅ CLI Command file 'cli.js' extracted successfully."
else
    echo "  ❌ Extraction failed! Please verify write permissions in: $PERM_DIR"
    read -p "Press Enter to exit..."
    exit 1
fi

# Detect local Ollama
echo ""
echo "[>] Detecting local Ollama AI service..."
if command -v ollama &> /dev/null; then
    echo "  ✅ Ollama installation detected."
else
    echo "  ⚠️ Ollama not found on your system."
    echo "  To download local models, install Ollama from: https://ollama.com"
fi

# Setup terminal aliases in shell profiles
SHELL_PROFILE=""
if [ -f "$HOME/.zshrc" ]; then
    SHELL_PROFILE="$HOME/.zshrc"
elif [ -f "$HOME/.bashrc" ]; then
    SHELL_PROFILE="$HOME/.bashrc"
fi

if [ -n "$SHELL_PROFILE" ]; then
    echo ""
    echo "[>] Registering global terminal aliases..."
    # Clean up legacy definitions to prevent command collisions
    grep -v "alias aetherai=" "$SHELL_PROFILE" > "$SHELL_PROFILE.tmp" || true
    mv "$SHELL_PROFILE.tmp" "$SHELL_PROFILE"
    grep -v "alias aether=" "$SHELL_PROFILE" > "$SHELL_PROFILE.tmp" || true
    mv "$SHELL_PROFILE.tmp" "$SHELL_PROFILE"
    
    echo "alias aetherai='node $PERM_DIR/cli.js'" >> "$SHELL_PROFILE"
    echo "alias aether='node $PERM_DIR/cli.js'" >> "$SHELL_PROFILE"
    echo "  ✅ Terminal commands 'aether' & 'aetherai' successfully added to $SHELL_PROFILE."
    echo "  (Open a new terminal session or run 'source $SHELL_PROFILE' to use them from anywhere!)"
fi

# Run the local server
echo ""
echo "[>] Starting local static server..."
node cli.js
`;

fs.writeFileSync(runShPath, shTemplate, { encoding: 'utf8', mode: 0o755 });
fs.writeFileSync(websiteRunShPath, shTemplate, { encoding: 'utf8', mode: 0o755 });
console.log("run.sh Compiled Successfully.");
console.log("Compilation complete!");

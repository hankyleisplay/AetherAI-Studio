# ==========================================================================
# AetherAI Studio - Pure PowerShell Static Web Server
# Hosts the application on http://localhost:8080 bypassing CORS limitations.
# ==========================================================================

$port = 8080
$listener = $null
$started = $false
$currentShell = if ($PSVersionTable.PSVersion.Major -ge 7) { "pwsh" } else { "powershell" }

while (!$started -and $port -lt 8100) {
    try {
        $listener = New-Object System.Net.HttpListener
        $listener.Prefixes.Add("http://localhost:$port/")
        $listener.Start()
        $started = $true
    } catch {
        if ($listener) {
            $listener.Close()
            $listener = $null
        }
        $port++
    }
}

if (!$started) {
    Write-Error "Could not find any available port to listen on!"
    exit 1
}

$workspacePath = Get-Location
$configPath = [System.IO.Path]::Combine($workspacePath, "config.json")
$agentWorkspacePath = Join-Path $workspacePath "workspace"

# Ensure agent sandboxed workspace folder exists
if (!(Test-Path $agentWorkspacePath)) {
    New-Item -ItemType Directory -Path $agentWorkspacePath -Force | Out-Null
}

# Ensure config.json exists
if (!(Test-Path $configPath)) {
    $defaultConfig = @{
        telegram_token = ""
        telegram_chat_id = ""
        ollama_url = "http://localhost:11434"
        provider = "ollama"
        model_name = ""
    } | ConvertTo-Json -Depth 5
    [System.IO.File]::WriteAllText($configPath, $defaultConfig, [System.Text.Encoding]::UTF8)
}

function Stop-TelegramBridge {
    $job = Get-Job -Name "TelegramBridge" -ErrorAction SilentlyContinue
    if ($job) {
        Write-Host "Stopping existing Telegram Bridge job..." -ForegroundColor Yellow
        Stop-Job -Name "TelegramBridge"
        Remove-Job -Name "TelegramBridge" -Force
    }
}

function Start-TelegramBridge {
    Stop-TelegramBridge
    
    if (Test-Path $configPath) {
        $config = [System.IO.File]::ReadAllText($configPath) | ConvertFrom-Json
        $token = $config.telegram_token
        $chatId = $config.telegram_chat_id
        
        if ($token -and $chatId) {
            Write-Host "Starting Telegram Bridge background job..." -ForegroundColor Green
            
            $telegramScript = {
                param($workspacePath, $token, $chatId, $ollamaUrl, $provider, $modelName)
                
                $lastUpdateId = 0
                $apiUrl = "https://api.telegram.org/bot$token"
                
                function Send-TelegramMessage($text) {
                    try {
                        $body = @{
                            chat_id = $chatId
                            text = $text
                            parse_mode = "Markdown"
                        } | ConvertTo-Json -Compress
                        $utf8Bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
                        $req = [System.Net.WebRequest]::Create("$apiUrl/sendMessage")
                        $req.Method = "POST"
                        $req.ContentType = "application/json; charset=utf-8"
                        $req.ContentLength = $utf8Bytes.Length
                        $stream = $req.GetRequestStream()
                        $stream.Write($utf8Bytes, 0, $utf8Bytes.Length)
                        $stream.Close()
                        $res = $req.GetResponse()
                        $res.Close()
                    } catch {}
                }
                
                function Send-TelegramTyping {
                    try {
                        $body = @{ chat_id = $chatId; action = "typing" } | ConvertTo-Json -Compress
                        $utf8Bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
                        $req = [System.Net.WebRequest]::Create("$apiUrl/sendChatAction")
                        $req.Method = "POST"
                        $req.ContentType = "application/json; charset=utf-8"
                        $req.ContentLength = $utf8Bytes.Length
                        $stream = $req.GetRequestStream()
                        $stream.Write($utf8Bytes, 0, $utf8Bytes.Length)
                        $stream.Close()
                        $res = $req.GetResponse()
                        $res.Close()
                    } catch {}
                }

                Send-TelegramMessage("🟢 *AetherAI Studio Telegram Bridge* is online!`nType any prompt or command to start local agent automation.")
                
                while ($true) {
                    try {
                        $pollUrl = "$apiUrl/getUpdates?offset=$($lastUpdateId + 1)&timeout=10"
                        $response = Invoke-RestMethod -Uri $pollUrl -Method Get -TimeoutSec 15
                        
                        if ($response.ok -and $response.result.Count -gt 0) {
                            foreach ($upd in $response.result) {
                                $lastUpdateId = $upd.update_id
                                $msg = $upd.message
                                if ($msg -and $msg.chat.id -eq $chatId -and $msg.text) {
                                    $userText = $msg.text
                                    Send-TelegramTyping
                                    
                                    $activeModel = $modelName
                                    if (!$activeModel) {
                                        try {
                                            $tags = Invoke-RestMethod -Uri "$ollamaUrl/api/tags" -Method Get
                                            if ($tags.models.Count -gt 0) {
                                                $activeModel = $tags.models[0].name
                                            }
                                        } catch {}
                                    }
                                    if (!$activeModel) { $activeModel = "llama3" }
                                    
                                    $systemPrompt = 'You are AetherAI, an autonomous agent running in the user''s sandboxed workspace directory (.aetherai).
You can execute terminal commands, list directories, read files, and write files using special XML tags:
- To run a command: <run_command>your terminal command</run_command>
- To list workspace directory: <list_dir></list_dir>
- To read a file: <read_file>path/to/file</read_file>
- To create or edit a file: <write_file path="path/to/file">file contents</write_file>

When the user asks you to do something, use these tags to run actions on their machine. You will receive the command results in the next turn and can continue your reasoning or give the final answer. Keep responses concise.'

                                    $messages = @(
                                        @{ role = "system"; content = $systemPrompt }
                                        @{ role = "user"; content = $userText }
                                    )
                                    
                                    $loopCount = 0
                                    $finished = $false
                                    $finalReply = ""
                                    
                                    while (!$finished -and $loopCount -lt 5) {
                                        $loopCount++
                                        Send-TelegramTyping
                                        
                                        $payload = @{
                                            model = $activeModel
                                            messages = $messages
                                            stream = $false
                                        } | ConvertTo-Json -Compress
                                        
                                        $utf8Payload = [System.Text.Encoding]::UTF8.GetBytes($payload)
                                        $ollamaReq = [System.Net.WebRequest]::Create("$ollamaUrl/api/chat")
                                        $ollamaReq.Method = "POST"
                                        $ollamaReq.ContentType = "application/json"
                                        $ollamaReq.ContentLength = $utf8Payload.Length
                                        $oStream = $ollamaReq.GetRequestStream()
                                        $oStream.Write($utf8Payload, 0, $utf8Payload.Length)
                                        $oStream.Close()
                                        
                                        $oRes = $ollamaReq.GetResponse()
                                        $oReader = New-Object System.IO.StreamReader($oRes.GetResponseStream())
                                        $oJson = $oReader.ReadToEnd()
                                        $oReader.Close()
                                        $oRes.Close()
                                        
                                        $ollamaParsed = $oJson | ConvertFrom-Json
                                        $aiReply = $ollamaParsed.message.content
                                        
                                        $hasAction = $false
                                        $actionResult = ""
                                        
                                        if ($aiReply -match "<run_command>([\s\S]*?)<\/run_command>") {
                                            $cmd = $Matches[1].Trim()
                                            $hasAction = $true
                                            Send-TelegramMessage("⚙️ _Agent Executing CMD:_ ``$cmd``")
                                            try {
                                                $stdoutPath = Join-Path $workspacePath "stdout.txt"
                                                $stderrPath = Join-Path $workspacePath "stderr.txt"
                                                $proc = Start-Process $currentShell -ArgumentList "-NoProfile -Command `"$cmd`"" -PassThru -NoNewWindow -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -WorkingDirectory $workspacePath -Wait
                                                $stdout = [System.IO.File]::ReadAllText($stdoutPath)
                                                $stderr = [System.IO.File]::ReadAllText($stderrPath)
                                                $actionResult = "STDOUT:`n$stdout`nSTDERR:`n$stderr"
                                                Remove-Item $stdoutPath, $stderrPath -ErrorAction SilentlyContinue
                                            } catch {
                                                $actionResult = "Error: " + $_.Exception.Message
                                            }
                                        }
                                        elseif ($aiReply -match "<list_dir><\/list_dir>") {
                                            $hasAction = $true
                                            Send-TelegramMessage("📂 _Agent Listing Workspace Directory..._")
                                            try {
                                                $items = Get-ChildItem -Path $workspacePath | Select-Object Name, Length, LastWriteTime
                                                $actionResult = ($items | Out-String)
                                            } catch {
                                                $actionResult = "Error: " + $_.Exception.Message
                                            }
                                        }
                                        elseif ($aiReply -match "<read_file>([\s\S]*?)<\/read_file>") {
                                            $path = $Matches[1].Trim()
                                            $hasAction = $true
                                            Send-TelegramMessage("📖 _Agent Reading File:_ ``$path``")
                                            try {
                                                $fullPath = [System.IO.Path]::Combine($workspacePath, $path)
                                                $actionResult = [System.IO.File]::ReadAllText($fullPath)
                                            } catch {
                                                $actionResult = "Error: " + $_.Exception.Message
                                            }
                                        }
                                        elseif ($aiReply -match "<write_file\s+path=`"([^`"]+)`">([\s\S]*?)<\/write_file>") {
                                            $path = $Matches[1].Trim()
                                            $content = $Matches[2]
                                            $hasAction = $true
                                            Send-TelegramMessage("✍️ _Agent Writing File:_ ``$path``")
                                            try {
                                                $fullPath = [System.IO.Path]::Combine($workspacePath, $path)
                                                [System.IO.File]::WriteAllText($fullPath, $content, [System.Text.Encoding]::UTF8)
                                                $actionResult = "File written successfully to $path"
                                            } catch {
                                                $actionResult = "Error: " + $_.Exception.Message
                                            }
                                        }
                                        
                                        if ($hasAction) {
                                            $messages += @{ role = "assistant"; content = $aiReply }
                                            $messages += @{ role = "user"; content = "ACTION EXECUTION RESULT:`n$actionResult" }
                                        } else {
                                            $finished = $true
                                            $finalReply = $aiReply
                                        }
                                    }
                                    
                                    if (!$finalReply) { $finalReply = $aiReply }
                                    Send-TelegramMessage($finalReply)
                                }
                            }
                        }
                    } catch {
                        Start-Sleep -Seconds 5
                    }
                    Start-Sleep -Seconds 2
                }
            }
            
            Start-Job -Name "TelegramBridge" -ScriptBlock $telegramScript -ArgumentList @($agentWorkspacePath, $token, $chatId, $config.ollama_url, $config.provider, $config.model_name) | Out-Null
        }
    }
}



Start-TelegramBridge

try {
    Start-Process "http://localhost:$port"

    Write-Host "==================================================" -ForegroundColor Cyan
    Write-Host "  AetherAI Studio Web Server is Running!" -ForegroundColor Green
    Write-Host "  👉 http://localhost:$port" -ForegroundColor Yellow
    Write-Host "==================================================" -ForegroundColor Cyan

    $workspacePath = Get-Location

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        try {
            $url = $request.Url.LocalPath
        
        # Cloud API CORS Bypass Proxy
        if ($url -eq "/api/proxy") {
            $targetUrl = $request.Headers["X-Target-URL"]
            if (!$targetUrl) {
                $targetUrl = $request.QueryString["url"]
            }

            if (!$targetUrl) {
                $response.StatusCode = 400
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("400 Bad Request: Missing X-Target-URL header or url query parameter")
                $response.ContentType = "text/plain; charset=utf-8"
                $response.ContentLength64 = $errBytes.Length
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                $response.Close()
                continue
            }

            # Handle Preflight OPTIONS request
            if ($request.HttpMethod -eq "OPTIONS") {
                $response.StatusCode = 200
                $response.Headers.Add("Access-Control-Allow-Origin", "*")
                $response.Headers.Add("Access-Control-Allow-Headers", "*")
                $response.Headers.Add("Access-Control-Allow-Methods", "*")
                $response.Close()
                continue
            }

            try {
                [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls11 -bor [System.Net.SecurityProtocolType]::Tls
                
                $webRequest = [System.Net.HttpWebRequest]::Create($targetUrl)
                $webRequest.Method = $request.HttpMethod
                $webRequest.ContentType = $request.ContentType
                $webRequest.Timeout = 60000
                
                # Forward standard request headers
                foreach ($headerKey in $request.Headers.AllKeys) {
                    if ($headerKey -notin @("Host", "Connection", "Content-Length", "Expect", "User-Agent", "X-Target-URL")) {
                        try {
                            $webRequest.Headers.Add($headerKey, $request.Headers[$headerKey])
                        } catch {}
                    }
                }

                # Forward request body
                if ($request.HasEntityBody) {
                    $reqStream = $request.InputStream
                    $targetReqStream = $webRequest.GetRequestStream()
                    $reqStream.CopyTo($targetReqStream)
                    $targetReqStream.Close()
                }

                $webResponse = $webRequest.GetResponse()
                $response.StatusCode = [int]$webResponse.StatusCode
                $response.ContentType = $webResponse.ContentType
                
                # Forward response headers (excluding CORS/Transfer-Encoding)
                foreach ($hKey in $webResponse.Headers.AllKeys) {
                    if ($hKey -notin @("Access-Control-Allow-Origin", "Access-Control-Allow-Headers", "Access-Control-Allow-Methods", "Transfer-Encoding")) {
                        try {
                            $response.Headers.Add($hKey, $webResponse.Headers[$hKey])
                        } catch {}
                    }
                }

                $response.Headers.Add("Access-Control-Allow-Origin", "*")
                $response.Headers.Add("Access-Control-Allow-Headers", "*")
                $response.Headers.Add("Access-Control-Allow-Methods", "*")

                # Stream response byte by byte to ensure zero-buffering real-time SSE streaming
                $resStream = $webResponse.GetResponseStream()
                $buffer = New-Object byte[] 4096
                while (($bytesRead = $resStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
                    $response.OutputStream.Write($buffer, 0, $bytesRead)
                    $response.OutputStream.Flush()
                }
                $webResponse.Close()
            } catch {
                $ex = $_.Exception
                $response.StatusCode = 500
                $response.Headers.Add("Access-Control-Allow-Origin", "*")
                $response.Headers.Add("Access-Control-Allow-Headers", "*")
                $response.Headers.Add("Access-Control-Allow-Methods", "*")
                
                if ($ex.GetType().Name -eq "WebException" -and $ex.Response -ne $null) {
                    $webResponse = $ex.Response
                    $response.StatusCode = [int]$webResponse.StatusCode
                    $response.ContentType = $webResponse.ContentType
                    $errStream = $webResponse.GetResponseStream()
                    $errStream.CopyTo($response.OutputStream)
                    $webResponse.Close()
                } else {
                    $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Proxy Error: " + $ex.Message)
                    $response.ContentType = "text/plain; charset=utf-8"
                    $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                }
            }
            $response.Close()
            continue
        }

        # 1. Agent Mode: List workspace files
        if ($url -eq "/api/agent/list") {
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Headers", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "*")
            if ($request.HttpMethod -eq "OPTIONS") {
                $response.StatusCode = 200
                $response.Close()
                continue
            }
            try {
                $files = Get-ChildItem -Path $agentWorkspacePath -Recurse -File | 
                    Where-Object { $_.FullName -notlike "*\.*" -and $_.FullName -notlike "*\node_modules\*" -and $_.FullName -notlike "*\OllamaSetup.exe" } |
                    Select-Object @{Name="path";Expression={$_.FullName.Replace($agentWorkspacePath, "").TrimStart("\").Replace("\", "/")}}, @{Name="size";Expression={$_.Length}}
                $jsonFiles = $files | ConvertTo-Json -Compress
                if (!$jsonFiles) { $jsonFiles = "[]" }
                $response.ContentType = "application/json; charset=utf-8"
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonFiles)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } catch {
                $response.StatusCode = 500
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Error: " + $_.Exception.Message)
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            }
            $response.Close()
            continue
        }

        # 2. Agent Mode: Read file content
        if ($url -eq "/api/agent/read") {
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Headers", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "*")
            if ($request.HttpMethod -eq "OPTIONS") {
                $response.StatusCode = 200
                $response.Close()
                continue
            }
            $filePathParam = $request.QueryString["path"]
            if ($filePathParam) { $filePathParam = $filePathParam.Replace("/", "\") }
            $fullPath = [System.IO.Path]::Combine($agentWorkspacePath, $filePathParam)
            
            if ($fullPath.StartsWith($agentWorkspacePath) -and (Test-Path $fullPath -PathType Leaf)) {
                try {
                    $content = [System.IO.File]::ReadAllText($fullPath)
                    $response.ContentType = "text/plain; charset=utf-8"
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
                    $response.ContentLength64 = $bytes.Length
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                } catch {
                    $response.StatusCode = 500
                }
            } else {
                $response.StatusCode = 404
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("File not found or access denied")
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            }
            $response.Close()
            continue
        }

        # 3. Agent Mode: Write file content
        if ($url -eq "/api/agent/write") {
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Headers", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "*")
            if ($request.HttpMethod -eq "OPTIONS") {
                $response.StatusCode = 200
                $response.Close()
                continue
            }
            $filePathParam = $request.QueryString["path"]
            if ($filePathParam) { $filePathParam = $filePathParam.Replace("/", "\") }
            $fullPath = [System.IO.Path]::Combine($agentWorkspacePath, $filePathParam)
            
            if ($fullPath.StartsWith($agentWorkspacePath)) {
                try {
                    $reqStream = $request.InputStream
                    $reader = New-Object System.IO.StreamReader($reqStream, [System.Text.Encoding]::UTF8)
                    $content = $reader.ReadToEnd()
                    $reader.Close()
                    
                    $parentDir = Split-Path $fullPath
                    if (!(Test-Path $parentDir)) {
                        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
                    }
                    [System.IO.File]::WriteAllText($fullPath, $content, [System.Text.Encoding]::UTF8)
                    $response.StatusCode = 200
                    $bytes = [System.Text.Encoding]::UTF8.GetBytes("Success")
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                } catch {
                    $response.StatusCode = 500
                    $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Error writing file: " + $_.Exception.Message)
                    $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                }
            } else {
                $response.StatusCode = 403
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Access denied outside workspace")
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            }
            $response.Close()
            continue
        }

        # 4. Agent Mode: Run terminal command
        if ($url -eq "/api/agent/run") {
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Headers", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "*")
            if ($request.HttpMethod -eq "OPTIONS") {
                $response.StatusCode = 200
                $response.Close()
                continue
            }
            try {
                $reqStream = $request.InputStream
                $reader = New-Object System.IO.StreamReader($reqStream, [System.Text.Encoding]::UTF8)
                $cmd = $reader.ReadToEnd()
                $reader.Close()
                
                $cmdResult = &$currentShell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Set-Location '$agentWorkspacePath'; $cmd" 2>&1 | Out-String
                if (!$cmdResult) { $cmdResult = "Command executed with no output." }
                $response.ContentType = "text/plain; charset=utf-8"
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($cmdResult)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } catch {
                $response.StatusCode = 500
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Execution Error: " + $_.Exception.Message)
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            }
            $response.Close()
            continue
        }

        # 3. Bridges Mode: Get settings
        if ($url -eq "/api/bridges/settings") {
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Headers", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "*")
            if ($request.HttpMethod -eq "OPTIONS") {
                $response.StatusCode = 200
                $response.Close()
                continue
            }
            try {
                $content = [System.IO.File]::ReadAllText($configPath)
                $response.ContentType = "application/json; charset=utf-8"
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($content)
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } catch {
                $response.StatusCode = 500
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Error: " + $_.Exception.Message)
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            }
            $response.Close()
            continue
        }

        # 4. Bridges Mode: Save settings and restart jobs
        if ($url -eq "/api/bridges/save") {
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Headers", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "*")
            if ($request.HttpMethod -eq "OPTIONS") {
                $response.StatusCode = 200
                $response.Close()
                continue
            }
            try {
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $body = $reader.ReadToEnd()
                $reader.Close()
                
                $newConfig = $body | ConvertFrom-Json
                $currentConfig = [System.IO.File]::ReadAllText($configPath) | ConvertFrom-Json
                
                if ($newConfig.telegram_token -ne $null) { $currentConfig.telegram_token = $newConfig.telegram_token }
                if ($newConfig.telegram_chat_id -ne $null) { $currentConfig.telegram_chat_id = $newConfig.telegram_chat_id }
                if ($newConfig.ollama_url -ne $null) { $currentConfig.ollama_url = $newConfig.ollama_url }
                if ($newConfig.provider -ne $null) { $currentConfig.provider = $newConfig.provider }
                if ($newConfig.model_name -ne $null) { $currentConfig.model_name = $newConfig.model_name }
                if ($newConfig.sd_url -ne $null) { $currentConfig.sd_url = $newConfig.sd_url }
                
                $jsonStr = $currentConfig | ConvertTo-Json -Depth 5
                [System.IO.File]::WriteAllText($configPath, $jsonStr, [System.Text.Encoding]::UTF8)
                
                Start-TelegramBridge
                
                $response.ContentType = "application/json; charset=utf-8"
                $resBytes = [System.Text.Encoding]::UTF8.GetBytes('{"status":"success"}')
                $response.ContentLength64 = $resBytes.Length
                $response.OutputStream.Write($resBytes, 0, $resBytes.Length)
            } catch {
                $response.StatusCode = 500
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Error: " + $_.Exception.Message)
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            }
            $response.Close()
            continue
        }

        # 5. Ollama Model Pull Proxy
        if ($url -eq "/api/ollama/pull") {
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Headers", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "*")
            if ($request.HttpMethod -eq "OPTIONS") {
                $response.StatusCode = 200
                $response.Close()
                continue
            }
            try {
                $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
                $body = $reader.ReadToEnd()
                $reader.Close()
                
                $payload = $body | ConvertFrom-Json
                $modelName = $payload.model
                
                if (!$modelName) {
                    $response.StatusCode = 400
                    $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Missing model parameter")
                    $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                    $response.Close()
                    continue
                }

                $config = [System.IO.File]::ReadAllText($configPath) | ConvertFrom-Json
                $ollamaUrl = if ($config.ollama_url) { $config.ollama_url } else { "http://localhost:11434" }
                
                $pullUrl = "$ollamaUrl/api/pull"
                
                Write-Host ""
                Write-Host "==================================================" -ForegroundColor Cyan
                Write-Host "🤖 Pulling Ollama Model: $modelName" -ForegroundColor Cyan
                Write-Host "==================================================" -ForegroundColor Cyan

                $postBody = @{ name = $modelName; stream = $true } | ConvertTo-Json
                $postBytes = [System.Text.Encoding]::UTF8.GetBytes($postBody)

                $ollamaReq = [System.Net.WebRequest]::Create($pullUrl)
                $ollamaReq.Method = "POST"
                $ollamaReq.ContentType = "application/json"
                $ollamaReq.ContentLength = $postBytes.Length
                $ollamaReq.Timeout = 600000 # 10 minutes

                $reqStream = $ollamaReq.GetRequestStream()
                $reqStream.Write($postBytes, 0, $postBytes.Length)
                $reqStream.Close()

                $ollamaRes = $ollamaReq.GetResponse()
                $resStream = $ollamaRes.GetResponseStream()

                $response.ContentType = "application/json; charset=utf-8"
                
                $buffer = New-Object byte[] 65536
                $streamBuffer = ""
                while ($true) {
                    $read = $resStream.Read($buffer, 0, $buffer.Length)
                    if ($read -le 0) { break }
                    
                    # Write back to web UI client
                    $response.OutputStream.Write($buffer, 0, $read)
                    $response.OutputStream.Flush()
                    
                    # Log progress inside terminal console
                    try {
                        $chunkStr = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $read)
                        $streamBuffer += $chunkStr
                        if ($streamBuffer.Contains("`n")) {
                            $lines = $streamBuffer.Split("`n")
                            $streamBuffer = $lines[-1]
                            
                            for ($i = 0; $i -lt ($lines.Length - 1); $i++) {
                                $line = $lines[$i]
                                if ([string]::IsNullOrWhiteSpace($line)) { continue }
                                $progress = $line | ConvertFrom-Json
                                if ($progress.status) {
                                    if ($progress.completed -and $progress.total) {
                                        $percent = ($progress.completed / $progress.total) * 100
                                        $mbCompleted = [math]::Round($progress.completed / 1MB, 1)
                                        $mbTotal = [math]::Round($progress.total / 1MB, 1)
                                        $percentStr = "{0:N1}%" -f $percent
                                        Write-Host "`r[Download] status: $($progress.status) ($mbCompleted MB / $mbTotal MB) $percentStr" -NoNewline -ForegroundColor Green
                                    } else {
                                        Write-Host "`r[Download] status: $($progress.status)                                                " -NoNewline -ForegroundColor Yellow
                                    }
                                }
                            }
                        }
                    } catch {}
                }
                
                Write-Host ""
                Write-Host "✅ Model $modelName downloaded successfully!" -ForegroundColor Green
                Write-Host "==================================================" -ForegroundColor Cyan

                $resStream.Close()
                $ollamaRes.Close()
            } catch {
                Write-Host "❌ Model pull failed: $_" -ForegroundColor Red
                $response.StatusCode = 500
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("Error: " + $_.Exception.Message)
                $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
            }
            $response.Close()
            continue
        }

        if ($url -eq "/") { $url = "/index.html" }
        
        # Clean and combine paths
        $cleanUrl = $url.Replace("/", "\").TrimStart("\")
        $filePath = [System.IO.Path]::Combine($workspacePath, $cleanUrl)
        
        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            
            # Content types mapping
            if ($filePath.EndsWith(".html")) { 
                $response.ContentType = "text/html; charset=utf-8" 
            }
            elseif ($filePath.EndsWith(".css")) { 
                $response.ContentType = "text/css; charset=utf-8" 
            }
            elseif ($filePath.EndsWith(".js")) { 
                $response.ContentType = "application/javascript; charset=utf-8" 
            }
            elseif ($filePath.EndsWith(".svg")) { 
                $response.ContentType = "image/svg+xml; charset=utf-8" 
            }
            elseif ($filePath.EndsWith(".png")) { 
                $response.ContentType = "image/png" 
            }
            
            # Add CORS Headers for security
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
            
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $url")
            $response.ContentType = "text/plain; charset=utf-8"
            $response.ContentLength64 = $errBytes.Length
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        $response.Close()
        } catch {
            Write-Host "Error serving request: $_" -ForegroundColor Red
            if ($response) {
                try { $response.Close() } catch {}
            }
        }
    }
}
catch {
    Write-Error $_
}
finally {
    Stop-TelegramBridge
    if ($listener) {
        $listener.Stop()
        $listener.Close()
    }
}

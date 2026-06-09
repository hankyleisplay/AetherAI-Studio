#!/usr/bin/env node

// ==========================================================================
// AetherAI Studio - Cross-Platform CLI Command Launcher
// Supports Windows, macOS, and Linux
// ==========================================================================

const fs = require('fs');
const path = require('path');
const { exec, execSync } = require('child_process');

const workspacePath = __dirname;
const configPath = path.join(workspacePath, 'config.json');

const flag = process.argv[2];

// Helper: check if command is available on system
function isCommandAvailable(cmd) {
  try {
    const checkCmd = process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`;
    execSync(checkCmd, { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

// ----------------------------------------------------
// CLI Option: Show Usage Guide
// ----------------------------------------------------
if (flag === '--help' || flag === '-h' || flag === '/?') {
  console.clear();
  console.log("==========================================================");
  console.log("            AetherAI Studio CLI Usage Guide");
  console.log("==========================================================");
  console.log("");
  console.log("  Syntax / 語法:");
  console.log("    aetherai [options]");
  console.log("    npm start -- [options]");
  console.log("");
  console.log("  Options / 選項:");
  console.log("    --onboard        Run system diagnostic & onboarding check");
  console.log("                     執行系統診斷與引導檢測");
  console.log("");
  console.log("    --fix            Diagnose & fix common configuration, CORS, and port issues");
  console.log("                     診斷並修復常見的設定、CORS 與連接埠衝突問題");
  console.log("");
  console.log("    --uninstall      Cleanly remove command shortcuts, paths, and background tasks");
  console.log("                     清除已註冊的終端機捷徑與背景工作");
  console.log("");
  console.log("    --help, -h, /?   Show this CLI command reference and options menu");
  console.log("                     顯示此指令說明與選單資訊");
  console.log("");
  console.log("==========================================================");
  process.exit(0);
}

// ----------------------------------------------------
// CLI Option: Onboarding diagnostics
// ----------------------------------------------------
if (flag === '--onboard') {
  console.clear();
  console.log("==========================================================");
  console.log("            AetherAI Studio Onboarding Guide");
  console.log("==========================================================");
  console.log("");
  console.log("Welcome to AetherAI! Scanning local system configurations...");
  console.log("");
  
  // 1. Scan Ollama
  console.log("[>] Checking local Ollama installation...");
  if (isCommandAvailable('ollama')) {
    console.log(" \x1b[32m[+]\x1b[0m Ollama is installed and active in system environment PATH.");
  } else {
    const isWin = process.platform === 'win32';
    const localOllama = isWin 
      ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Ollama', 'ollama.exe')
      : '/usr/local/bin/ollama';
      
    if (fs.existsSync(localOllama)) {
      console.log(` \x1b[32m[+]\x1b[0m Ollama is installed locally at: ${localOllama}`);
    } else {
      console.log(" \x1b[33m[!]\x1b[0m Ollama not found. Run AetherAI normally to download and install Ollama.");
    }
  }
  
  // 2. Scan Config & bridges
  console.log("");
  console.log("[>] Checking Messaging Bridges...");
  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.telegram_token && config.telegram_chat_id) {
        console.log(` \x1b[32m[+]\x1b[0m Telegram Bridge: CONFIGURED (Token: ${config.telegram_token.substring(0, 5)}...)`);
      } else {
        console.log(" \x1b[90m[!]\x1b[0m Telegram Bridge: NOT CONFIGURED");
      }
      
      if (config.discord_webhook) {
        console.log(" \x1b[32m[+]\x1b[0m Discord Broadcaster: CONFIGURED");
      } else {
        console.log(" \x1b[90m[!]\x1b[0m Discord Broadcaster: NOT CONFIGURED");
      }
    } catch (e) {
      console.log(" \x1b[31m[!]\x1b[0m Failed to parse config.json settings.");
    }
  } else {
    console.log(" \x1b[90m[!]\x1b[0m config.json not created yet. Run 'aetherai' to initialize.");
  }
  
  console.log("");
  console.log("Onboarding completed successfully. Run 'aetherai' to boot the server.");
  process.exit(0);
}

// ----------------------------------------------------
// CLI Option: Common configuration fixes
// ----------------------------------------------------
if (flag === '--fix') {
  console.clear();
  console.log("==========================================================");
  console.log("            AetherAI Studio Diagnoser & Fixer");
  console.log("==========================================================");
  console.log("");
  console.log("[>] Running common repairs...");
  console.log("");
  
  // 1. Repair CORS origins for Ollama
  console.log("[>] Restarting Ollama with wildcard CORS origins...");
  const isWin = process.platform === 'win32';
  
  if (isWin) {
    execSync('taskkill /F /IM ollama.exe /T 2>nul || rem', { stdio: 'ignore' });
    exec('set OLLAMA_ORIGINS=* && start "" /B ollama serve', { shell: true });
    console.log(" \x1b[32m[+]\x1b[0m Ollama CORS restart triggered (Windows).");
  } else {
    exec('killall ollama 2>/dev/null || true', { stdio: 'ignore' });
    exec('OLLAMA_ORIGINS="*" nohup ollama serve >/dev/null 2>&1 &', { shell: true });
    console.log(" \x1b[32m[+]\x1b[0m Ollama CORS restart triggered (macOS/Linux).");
  }
  
  // 2. Validate Port Conflict
  console.log("");
  console.log("[>] Testing default port 8080 availability...");
  const http = require('http');
  const serverTest = http.createServer();
  serverTest.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(" \x1b[33m[!]\x1b[0m Warning: Port 8080 is occupied. AetherAI web server will bind to the next free port.");
    }
  });
  serverTest.once('listening', () => {
    console.log(" \x1b[32m[+]\x1b[0m Port 8080 is free and available.");
    serverTest.close();
  });
  serverTest.listen(8080);
  
  setTimeout(() => {
    console.log("");
    console.log("\x1b[32mAll diagnostics and fixes completed successfully!\x1b[0m");
    process.exit(0);
  }, 1500);
  return;
}

// ----------------------------------------------------
// CLI Option: Uninstall / Cleanup
// ----------------------------------------------------
if (flag === '--uninstall') {
  console.clear();
  console.log("==========================================================");
  console.log("            AetherAI Studio Clean Uninstaller");
  console.log("==========================================================");
  console.log("");
  console.log("Warning: This action will clean command integrations and Desktop shortcuts.");
  console.log("The workspace directory will remain intact.");
  console.log("");
  
  const isWin = process.platform === 'win32';
  if (isWin) {
    const desktopPath = path.join(process.env.USERPROFILE, 'Desktop', 'AetherAI Studio.lnk');
    if (fs.existsSync(desktopPath)) {
      fs.unlinkSync(desktopPath);
      console.log(" \x1b[32m[+]\x1b[0m Desktop shortcut removed.");
    }
    
    // Command wrappers
    const aetherCmd = path.join(workspacePath, 'aether.cmd');
    const aetheraiCmd = path.join(workspacePath, 'aetherai.cmd');
    if (fs.existsSync(aetherCmd)) fs.unlinkSync(aetherCmd);
    if (fs.existsSync(aetheraiCmd)) fs.unlinkSync(aetheraiCmd);
    console.log(" \x1b[32m[+]\x1b[0m Command wrapper batch files removed.");
  } else {
    // macOS/Linux cleanup
    console.log("For macOS/Linux, clean the alias manually in your ~/.zshrc or ~/.bashrc:");
    console.log("  alias aetherai=\"node /path/to/cli.js\"");
  }
  
  console.log("");
  console.log("🎉 Uninstallation helper completed.");
  process.exit(0);
}

// ----------------------------------------------------
// DEFAULT RUN: Start Server & Launch Browser
// ----------------------------------------------------
const readline = require('readline');
const http = require('http');

function startTerminalChat() {
  console.clear();
  console.log("\x1b[36m==========================================================\x1b[0m");
  console.log("\x1b[36m         AetherAI Studio - Terminal Chat\x1b[0m");
  console.log("\x1b[36m==========================================================\x1b[0m");
  console.log("\x1b[90mType 'exit' or 'quit' to exit. / 輸入 'exit' 或 'quit' 退出對話。\x1b[0m");
  console.log("");

  let provider = 'ollama';
  let url = 'http://localhost:11434';
  let model = '';

  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (config.provider) provider = config.provider;
      if (config.ollama_url) url = config.ollama_url;
      if (config.model_name) model = config.model_name;
    } catch (e) {}
  }

  if (!model) {
    model = 'llama3';
  }

  console.log(`Active Provider: \x1b[33m${provider}\x1b[0m`);
  console.log(`Active Model: \x1b[33m${model}\x1b[0m`);
  console.log(`API Endpoint: \x1b[33m${url}\x1b[0m`);
  console.log("\x1b[90m----------------------------------------------------------\x1b[0m");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const sysPrompt = "You are a helpful assistant named AetherAI.";

  function askQuestion() {
    rl.question('\n\x1b[32mYou > \x1b[0m', (input) => {
      if (input.trim().toLowerCase() === 'exit' || input.trim().toLowerCase() === 'quit') {
        rl.close();
        process.exit(0);
      }

      if (input.trim().toLowerCase() === '/model') {
        process.stdout.write('\x1b[90mFetching available models...\x1b[0m\n');
        const parsedUrl = new URL(url);
        const isOllama = provider === 'ollama';
        const pathStr = isOllama ? '/api/tags' : '/v1/models';
        
        const options = {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
          path: pathStr,
          method: 'GET',
          timeout: 5000
        };

        const clientReq = http.request(options, (res) => {
          let rawData = '';
          res.on('data', (chunk) => { rawData += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(rawData);
              let modelsList = [];
              if (isOllama) {
                modelsList = parsed.models ? parsed.models.map(m => m.name) : [];
              } else {
                modelsList = parsed.data ? parsed.data.map(m => m.id) : [];
              }

              if (modelsList.length > 0) {
                console.log('\n\x1b[1mAvailable Models:\x1b[0m');
                modelsList.forEach((m, idx) => {
                  console.log(`   [${idx + 1}] ${m}`);
                });
                
                rl.question(`\n\x1b[33mSelect model number (1-${modelsList.length}): \x1b[0m`, (num) => {
                  const idx = parseInt(num) - 1;
                  if (idx >= 0 && idx < modelsList.length) {
                    model = modelsList[idx];
                    console.log(`\x1b[32mSwitched to model: ${model}\x1b[0m`);
                    // Save to config.json
                    try {
                      let currentConfig = {};
                      if (fs.existsSync(configPath)) {
                        currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                      }
                      currentConfig.model_name = model;
                      fs.writeFileSync(configPath, JSON.stringify(currentConfig, null, 2), 'utf8');
                    } catch (e) {}
                  } else {
                    console.log('\x1b[31mInvalid selection.\x1b[0m');
                  }
                  askQuestion();
                });
              } else {
                console.log('\x1b[33mNo models found.\x1b[0m');
                askQuestion();
              }
            } catch (e) {
              console.log(`\x1b[31mError parsing models API response.\x1b[0m`);
              askQuestion();
            }
          });
        });

        clientReq.on('error', (e) => {
          console.log(`\x1b[31m❌ API Connection Error: ${e.message}\x1b[0m`);
          askQuestion();
        });

        clientReq.end();
        return;
      }

      process.stdout.write('\x1b[90mThinking...\x1b[0m');

      const parsedUrl = new URL(url);
      const isOllama = provider === 'ollama';
      const pathStr = isOllama ? '/api/chat' : '/v1/chat/completions';
      
      const payload = isOllama ? {
        model: model,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: input }
        ],
        stream: false
      } : {
        model: model,
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: input }
        ],
        stream: false
      };

      const bodyData = JSON.stringify(payload);
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: pathStr,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyData)
        }
      };

      const clientReq = http.request(options, (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          // Clear "Thinking..."
          readline.clearLine(process.stdout, 0);
          readline.cursorTo(process.stdout, 0);
          process.stdout.write('\x1b[36mAetherAI > \x1b[0m');

          try {
            const parsed = JSON.parse(rawData);
            let reply = '';
            if (isOllama) {
              reply = parsed.message ? parsed.message.content : '';
            } else {
              reply = (parsed.choices && parsed.choices[0]) ? parsed.choices[0].message.content : '';
            }
            console.log(reply);
          } catch (e) {
            console.log(`\n\x1b[31mError parsing API response.\x1b[0m Raw response: ${rawData}`);
          }
          askQuestion();
        });
      });

      clientReq.on('error', (e) => {
        readline.clearLine(process.stdout, 0);
        readline.cursorTo(process.stdout, 0);
        console.log(`\n\x1b[31m❌ API Connection Error: ${e.message}\x1b[0m`);
        askQuestion();
      });

      clientReq.write(bodyData);
      clientReq.end();
    });
  }

  askQuestion();
}

function bootWebServer() {
  console.log("Booting AetherAI Studio local server...");
  require('./server.js');

  setTimeout(() => {
    const launchUrl = "http://localhost:8080";
    const startCmd = process.platform === 'win32'
      ? `start ${launchUrl}`
      : process.platform === 'darwin'
        ? `open ${launchUrl}`
        : `xdg-open ${launchUrl}`;
        
    exec(startCmd, (err) => {
      if (err) {
        console.log(`Failed to open browser automatically. Please open: ${launchUrl}`);
      } else {
        console.log("🌐 Browser opened successfully.");
      }
    });
  }, 800);
}

// Interactive menu selection at boot
const rlMenu = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.clear();
console.log("\x1b[36m==========================================================\x1b[0m");
console.log("\x1b[36m         Please select your launch mode / 請選擇啟動模式:\x1b[0m");
console.log("   [1] Chat directly in Terminal (終端機與 AI 對話)");
console.log("   [2] Start Local Web Server & Open Web UI (啟動本地網頁伺服器)");
console.log("   [3] Exit / 結束離開");
console.log("\x1b[36m==========================================================\x1b[0m");

rlMenu.question('  Please press 1, 2 or 3: ', (answer) => {
  rlMenu.close();
  if (answer.trim() === '1') {
    startTerminalChat();
  } else if (answer.trim() === '2') {
    bootWebServer();
  } else {
    process.exit(0);
  }
});

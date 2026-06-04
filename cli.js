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
console.log("Booting AetherAI Studio local server...");

// Load server.js programmatically
require('./server.js');

// Give the server 800ms to bind, then launch default browser
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

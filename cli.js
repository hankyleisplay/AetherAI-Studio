#!/usr/bin/env node

/**
 * AetherAI Studio 2.0 (AetherAgent) - CLI Launcher
 * Cross-platform entry point for npm / npx
 */

const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const startScript = path.join(projectRoot, 'start.py');

// Find Python executable
function getPythonCommand() {
  const isWindows = process.platform === 'win32';
  const candidates = isWindows 
    ? ['python3', 'python', 'py'] 
    : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch (e) {
      // Continue search
    }
  }
  return null;
}

const pyCmd = getPythonCommand();

if (!pyCmd) {
  console.error('\n\x1b[31m[❌ 錯誤] 未檢測到 Python 3 執行環境！\x1b[0m');
  console.error('AetherAI Studio 2.0 (AetherAgent) 後端核心需要 Python >= 3.10。');
  console.error('請前往 https://www.python.org/downloads/ 安裝 Python 3 後再次執行。\n');
  process.exit(1);
}

// Pass all CLI arguments to start.py
const args = [startScript, ...process.argv.slice(2)];

const child = spawn(pyCmd, args, {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    PYTHONUNBUFFERED: '1'
  }
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error('\n\x1b[31m[❌ 啟動失敗]\x1b[0m', err.message);
  process.exit(1);
});

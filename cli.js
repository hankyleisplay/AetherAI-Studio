#!/usr/bin/env node

/**
 * Aether AI Studio 3.0 (AetherAgent) - CLI Launcher
 * Cross-platform entry point for npm / npx
 */

const { spawn, spawnSync } = require('child_process');
const path = require('path');

const projectRoot = __dirname;
const startScript = path.join(projectRoot, 'start.py');

/**
 * Find a valid Python >= 3.10 command, avoiding Windows Store alias stubs
 * and avoiding stdout path encoding issues on non-ASCII Windows usernames.
 */
function getPythonCommand() {
  const isWindows = process.platform === 'win32';
  const candidates = isWindows
    ? [
        { cmd: 'python', prefixArgs: [] },
        { cmd: 'py', prefixArgs: ['-3'] },
        { cmd: 'python3', prefixArgs: [] }
      ]
    : [
        { cmd: 'python3', prefixArgs: [] },
        { cmd: 'python', prefixArgs: [] }
      ];

  for (const candidate of candidates) {
    try {
      const res = spawnSync(
        candidate.cmd,
        [...candidate.prefixArgs, '-c', 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)'],
        { stdio: 'ignore', timeout: 5000 }
      );
      if (res.status === 0) {
        return candidate;
      }
    } catch (e) {
      // Continue search
    }
  }
  return null;
}

const py = getPythonCommand();

if (!py) {
  console.error('\n\x1b[31m[❌ 錯誤] 未檢測到 Python 3.10+ 執行環境！\x1b[0m');
  console.error('Aether AI Studio 3.0 (AetherAgent) 後端核心需要 Python >= 3.10。');
  console.error('請前往 https://www.python.org/downloads/ 安裝 Python 3 後再次執行。\n');
  process.exit(1);
}

// Pass all CLI arguments to start.py
const args = [...py.prefixArgs, startScript, ...process.argv.slice(2)];

const child = spawn(py.cmd, args, {
  cwd: projectRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1'
  }
});

child.on('exit', (code) => {
  process.exit(code || 0);
});

child.on('error', (err) => {
  console.error('\n\x1b[31m[❌ 啟動失敗]\x1b[0m', err.message);
  process.exit(1);
});

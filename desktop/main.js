const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

let mainWindow = null;
let tray = null;
let backendProcess = null;

const PORT = process.env.AETHER_PORT || 8000;
const SERVER_URL = `http://127.0.0.1:${PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Check if the AetherAI Studio backend is responding.
 */
function isServerReady() {
  return new Promise((resolve) => {
    const req = http.get(`${SERVER_URL}/api/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Auto-launch local Python backend if server is not yet running.
 */
async function ensureBackendRunning() {
  const ready = await isServerReady();
  if (ready) return;

  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const startScript = path.join(PROJECT_ROOT, 'start.py');

  backendProcess = spawn(pythonCmd, [startScript, '--no-browser', `--port=${PORT}`], {
    cwd: PROJECT_ROOT,
    stdio: 'ignore',
    env: { ...process.env, PYTHONUNBUFFERED: '1' }
  });

  backendProcess.on('error', (err) => {
    console.error('[AetherDesktop] Failed to spawn Python backend:', err.message);
  });
}

/**
 * Wait for backend server with polling timeout.
 */
async function waitForBackend(maxRetries = 25, delayMs = 600) {
  for (let i = 0; i < maxRetries; i++) {
    if (await isServerReady()) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#090d16',
    title: 'AetherAI Studio 3.0 (Preview)',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Window Controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

function createTray() {
  const iconPath = path.join(PROJECT_ROOT, 'assets', 'icon.svg');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
  } catch (e) {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '顯示 AetherAI Studio 3.0',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    {
      label: '開啟工作區目錄 (Workspace)',
      click: () => {
        shell.openPath(path.join(PROJECT_ROOT, 'backend', 'workspace'));
      }
    },
    { type: 'separator' },
    {
      label: 'GitHub 專案開源庫',
      click: () => {
        shell.openExternal('https://github.com/hankyleisplay/AetherAI-Studio');
      }
    },
    { type: 'separator' },
    {
      label: '結束程式 (Quit)',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('AetherAI Studio 3.0 (AetherAgent)');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) mainWindow.hide();
      else {
        mainWindow.show();
        mainWindow.focus();
      }
    }
  });
}

// App Lifecycle
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    await ensureBackendRunning();
    await waitForBackend();
    createWindow();
    createTray();

    // Register global shortcut to toggle desktop window: Ctrl+Shift+A (or Cmd+Shift+A)
    const { globalShortcut } = require('electron');
    try {
      globalShortcut.register('CommandOrControl+Shift+A', () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      });
    } catch (e) {}

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (backendProcess) {
      try {
        backendProcess.kill();
      } catch (e) {}
    }
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    try {
      backendProcess.kill();
    } catch (e) {}
  }
});

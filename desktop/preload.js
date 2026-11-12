const { contextBridge, ipcRenderer } = require('electron');

// A sandboxed preload cannot require local files, so the main process passes the version as an argument
const versionArg = process.argv.find((arg) => arg.startsWith('--aether-version='));
const APP_VERSION = versionArg ? versionArg.split('=')[1] : '';

// Expose safe desktop platform APIs to renderer window
contextBridge.exposeInMainWorld('aetherDesktop', {
  isDesktop: true,
  version: APP_VERSION,
  platform: process.platform,
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close')
});

const { contextBridge, ipcRenderer } = require('electron');

// Expose safe desktop platform APIs to renderer window
contextBridge.exposeInMainWorld('aetherDesktop', {
  isDesktop: true,
  version: '3.0.0-preview',
  platform: process.platform,
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close')
});

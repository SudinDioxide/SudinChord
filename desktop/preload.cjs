const { contextBridge, ipcRenderer, webUtils } = require('electron');

// 1. Expose Electron platform utilities to window
contextBridge.exposeInMainWorld('electronPlatform', {
  isElectron: true,
  isWindows: process.platform === 'win32',
  sendMediaState: (state) => ipcRenderer.send('bitchord:media-state', state),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  openLocalFiles: () => ipcRenderer.invoke('local:open-files'),
  openLocalFolder: () => ipcRenderer.invoke('local:open-folder'),
  scanLocalFolder: (folderPath) => ipcRenderer.invoke('local:scan-folder', folderPath),
  parseLocalFiles: (filePaths) => ipcRenderer.invoke('local:parse-files', filePaths),
  getFolderArt: (dirPath) => ipcRenderer.invoke('local:get-folder-art', dirPath),
  getPathForFile: (file) => (webUtils ? webUtils.getPathForFile(file) : file?.path || null),
});

// 2. Built-in Native Bridge Relay
// Answers the bitchord-bridge protocol directly in desktop mode,
// so the app has full capabilities without needing a browser extension.
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || typeof data !== 'object') return;
  if (data.channel !== 'bitchord-bridge' || data.direction !== 'to-extension') return;

  const { id, method, params } = data;

  try {
    const result = await ipcRenderer.invoke('bridge:call', { method, params });
    window.postMessage(
      {
        channel: 'bitchord-bridge',
        protocol: 1,
        direction: 'to-page',
        id,
        ok: true,
        result,
      },
      '*',
    );
  } catch (err) {
    window.postMessage(
      {
        channel: 'bitchord-bridge',
        protocol: 1,
        direction: 'to-page',
        id,
        ok: false,
        error: {
          code: err.code || 'internal',
          message: err.message || String(err),
        },
      },
      '*',
    );
  }
});

// 3. Forward event pushes from Electron to the web app
ipcRenderer.on('bridge:event', (_event, payload) => {
  window.postMessage(
    {
      channel: 'bitchord-bridge',
      direction: 'event',
      payload,
    },
    '*',
  );
});

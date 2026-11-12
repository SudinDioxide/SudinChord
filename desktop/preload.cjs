const { contextBridge, ipcRenderer, webUtils } = require('electron');

// 1. Expose Electron platform utilities to window
contextBridge.exposeInMainWorld('electronPlatform', {
  isElectron: true,
  isWindows: process.platform === 'win32',
  sendMediaState: (state) => ipcRenderer.send('media:state', state),
  toggleMiniPlayer: (options) => ipcRenderer.send('window:toggle-mini-player', options),
  onMediaCommand: (callback) => {
    const handler = (_event, cmd, data) => callback(cmd, data);
    ipcRenderer.on('media:command', handler);
    return () => ipcRenderer.removeListener('media:command', handler);
  },
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  openLocalFiles: () => ipcRenderer.invoke('local:open-files'),
  openLocalFolder: () => ipcRenderer.invoke('local:open-folder'),
  scanLocalFolder: (folderPath) => ipcRenderer.invoke('local:scan-folder', folderPath),
  parseLocalFiles: (filePaths) => ipcRenderer.invoke('local:parse-files', filePaths),
  getFolderArt: (dirPath) => ipcRenderer.invoke('local:get-folder-art', dirPath),
  getPathForFile: (file) => (webUtils ? webUtils.getPathForFile(file) : file?.path || null),
  // Picture-in-Picture & Mini-Player Video Streaming
  sendPipOffer: (offer) => ipcRenderer.send('pip:offer', offer),
  onPipAnswer: (callback) => {
    const handler = (_event, answer) => callback(answer);
    ipcRenderer.on('pip:answer', handler);
    return () => ipcRenderer.removeListener('pip:answer', handler);
  },
  sendPipCandidate: (candidate) => ipcRenderer.send('pip:candidate-to-pip', candidate),
  onPipCandidate: (callback) => {
    const handler = (_event, candidate) => callback(candidate);
    ipcRenderer.on('pip:candidate-to-main', handler);
    return () => ipcRenderer.removeListener('pip:candidate-to-main', handler);
  },
  sendPipVideoActive: (active) => ipcRenderer.send('pip:video-active', active),
  sendLyrics: (lyrics) => ipcRenderer.send('media:lyrics', lyrics),
  onMiniPlayerStatus: (callback) => {
    const handler = (_event, isOpen) => callback(isOpen);
    ipcRenderer.on('miniplayer:status', handler);
    return () => ipcRenderer.removeListener('miniplayer:status', handler);
  },
  // Auto-Updater hooks
  checkForUpdates: () => ipcRenderer.send('app:check-for-updates'),
  installUpdate: () => ipcRenderer.send('app:install-update'),
  onUpdateAvailable: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('app:update-available', handler);
    return () => ipcRenderer.removeListener('app:update-available', handler);
  },
  onUpdateDownloaded: (callback) => {
    const handler = (_event, info) => callback(info);
    ipcRenderer.on('app:update-downloaded', handler);
    return () => ipcRenderer.removeListener('app:update-downloaded', handler);
  },
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

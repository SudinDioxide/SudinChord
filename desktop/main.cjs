const { app, BrowserWindow, session, ipcMain, nativeTheme, shell, dialog, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');
const ytAuth = require('./ytAuth.cjs');
const spotifyAuth = require('./spotifyAuth.cjs');
const { extractMetadata, extractArtwork, AUDIO_EXTS } = require('./localMetadata.cjs');

app.name = 'SudinChord';

// Persistent metadata cache for instant folder scans
const metadataCache = new Map();
let metadataCacheLoaded = false;
let metadataCacheDirty = false;

function getMetadataCachePath() {
  try {
    return path.join(app.getPath('userData'), 'metadata_cache.json');
  } catch {
    return path.join(__dirname, 'metadata_cache.json');
  }
}

function loadMetadataCache() {
  if (metadataCacheLoaded) return;
  metadataCacheLoaded = true;
  try {
    const p = getMetadataCachePath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      for (const [k, v] of Object.entries(data)) {
        metadataCache.set(k, v);
      }
    }
  } catch {}
}

function saveMetadataCache() {
  if (!metadataCacheDirty) return;
  metadataCacheDirty = false;
  try {
    const p = getMetadataCachePath();
    const obj = {};
    for (const [k, v] of metadataCache.entries()) {
      obj[k] = v;
    }
    fs.promises.writeFile(p, JSON.stringify(obj)).catch(() => {});
  } catch {}
}

async function getCachedOrExtractMetadata(f) {
  loadMetadataCache();
  try {
    const stat = await fs.promises.stat(f);
    const cached = metadataCache.get(f);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.meta) {
      return cached.meta;
    }
    const meta = await extractMetadata(f);
    metadataCache.set(f, { mtimeMs: stat.mtimeMs, meta });
    metadataCacheDirty = true;
    return meta;
  } catch {
    return await extractMetadata(f);
  }
}

function getFfmpegPath() {
  const candidates = [
    path.join(process.resourcesPath, 'bin', 'ffmpeg.exe'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', 'ffmpeg.exe'),
    path.join(__dirname, 'bin', 'ffmpeg.exe'),
    path.join(__dirname, 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  try {
    const ff = require('ffmpeg-static');
    if (ff && fs.existsSync(ff)) return ff;
  } catch {}
  return null;
}

function isAlacFile(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16384);
    const read = fs.readSync(fd, buf, 0, 16384, 0);
    fs.closeSync(fd);
    return buf.subarray(0, read).indexOf('alac') !== -1;
  } catch {
    return false;
  }
}

function getOrTranscodeAlac(filePath) {
  try {
    let cacheDir;
    try {
      cacheDir = path.join(app.getPath('temp'), 'sudinchord_alac_cache');
    } catch {
      cacheDir = path.join(__dirname, 'temp_cache');
    }
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const hash = crypto.createHash('md5').update(filePath).digest('hex');
    const cachedWav = path.join(cacheDir, `${hash}.wav`);
    if (fs.existsSync(cachedWav)) {
      return cachedWav;
    }
    const ffmpeg = getFfmpegPath();
    if (ffmpeg) {
      execFileSync(ffmpeg, ['-i', filePath, '-c:a', 'pcm_s16le', '-y', cachedWav], {
        stdio: 'ignore',
        timeout: 45000,
      });
      if (fs.existsSync(cachedWav)) {
        return cachedWav;
      }
    }
  } catch (err) {
    console.error('[Desktop] Transcoding ALAC error:', err);
  }
  return filePath;
}

// Register local-audio scheme before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-audio',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36';
app.userAgentFallback = CHROME_UA;

// Ensure dark mode matching BitChord's theme
nativeTheme.themeSource = 'dark';

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let staticServer = null;

const PORT = 5173;
const DIST_PATH = fs.existsSync(path.join(__dirname, 'dist'))
  ? path.join(__dirname, 'dist')
  : path.resolve(__dirname, '../app/dist');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function startLocalServer() {
  return new Promise((resolve) => {
    staticServer = http.createServer((req, res) => {
      const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);

      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length, *',
      };

      if (req.method === 'OPTIONS') {
        res.writeHead(204, { ...corsHeaders, 'Access-Control-Max-Age': '86400' });
        res.end();
        return;
      }

      // Handle streaming local media files with Range seeking support
      if (parsedUrl.pathname === '/local-file') {
        const rawPath = parsedUrl.searchParams.get('path');
        if (!rawPath) {
          res.writeHead(404, corsHeaders);
          res.end('File not found');
          return;
        }

        const targetPath = path.normalize(rawPath);
        if (!fs.existsSync(targetPath)) {
          res.writeHead(404, corsHeaders);
          res.end('File not found');
          return;
        }

        if (parsedUrl.searchParams.get('art') === '1') {
          extractArtwork(targetPath)
            .then((art) => {
              if (art && art.buffer) {
                res.writeHead(200, {
                  'Content-Type': art.mime,
                  'Content-Length': art.buffer.length,
                  'Cache-Control': 'public, max-age=86400',
                  ...corsHeaders,
                });
                res.end(art.buffer);
              } else {
                res.writeHead(404, corsHeaders);
                res.end('No artwork');
              }
            })
            .catch(() => {
              res.writeHead(404, corsHeaders);
              res.end('No artwork');
            });
          return;
        }

        let streamPath = targetPath;
        const ext = path.extname(targetPath).toLowerCase();
        if (ext === '.m4a' && isAlacFile(targetPath)) {
          streamPath = getOrTranscodeAlac(targetPath);
        }

        let stat;
        try {
          stat = fs.statSync(streamPath);
        } catch {
          res.writeHead(404, corsHeaders);
          res.end('File read error');
          return;
        }

        const actualExt = path.extname(streamPath).toLowerCase();
        const AUDIO_MIMES = {
          '.mp3': 'audio/mpeg',
          '.flac': 'audio/flac',
          '.wav': 'audio/wav',
          '.m4a': 'audio/mp4',
          '.aac': 'audio/aac',
          '.ogg': 'audio/ogg',
          '.opus': 'audio/opus',
          '.webm': 'audio/webm',
        };
        const contentType = AUDIO_MIMES[actualExt] || AUDIO_MIMES[ext] || 'audio/mpeg';

        if (req.method === 'HEAD') {
          res.writeHead(200, {
            'Content-Length': stat.size,
            'Content-Type': contentType,
            'Accept-Ranges': 'bytes',
            ...corsHeaders,
          });
          res.end();
          return;
        }

        const range = req.headers.range;
        if (range) {
          const match = range.match(/bytes=(\d*)-(\d*)/);
          if (match) {
            let start;
            let end;
            if (match[1] === '') {
              // Suffix range: bytes=-500 (request last 500 bytes)
              const suffixLen = parseInt(match[2], 10);
              if (isNaN(suffixLen)) {
                start = 0;
                end = stat.size - 1;
              } else {
                start = Math.max(0, stat.size - suffixLen);
                end = stat.size - 1;
              }
            } else {
              start = parseInt(match[1], 10);
              end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
            }

            if (isNaN(start) || start < 0) start = 0;
            if (isNaN(end) || end >= stat.size) end = stat.size - 1;

            if (start > end || start >= stat.size) {
              res.writeHead(416, {
                'Content-Range': `bytes */${stat.size}`,
                ...corsHeaders,
              });
              res.end();
              return;
            }

            const chunksize = end - start + 1;
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${stat.size}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunksize,
              'Content-Type': contentType,
              ...corsHeaders,
            });

            const stream = fs.createReadStream(streamPath, { start, end });
            req.on('close', () => {
              stream.destroy();
            });
            stream.pipe(res);
            return;
          }
        }

        res.writeHead(200, {
          'Content-Length': stat.size,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
          ...corsHeaders,
        });
        const fullStream = fs.createReadStream(streamPath);
        req.on('close', () => {
          fullStream.destroy();
        });
        fullStream.pipe(res);
        return;
      }

      let reqPath = decodeURIComponent(parsedUrl.pathname);
      if (reqPath === '/') reqPath = '/index.html';

      let filePath = path.join(DIST_PATH, reqPath);

      // SPA fallback
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(DIST_PATH, 'index.html');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, content) => {
        if (err) {
          res.writeHead(500);
          res.end('Error loading ' + reqPath);
          return;
        }
        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
        });
        res.end(content);
      });
    });

    staticServer.on('error', (err) => {
      console.warn('[Desktop] Local HTTP server error (likely dev server running):', err.message);
      resolve(false);
    });

    staticServer.listen(PORT, () => {
      console.log(`[Desktop] Static server running on port ${PORT}`);
      resolve(true);
    });
  });
}

async function broadcastAuthState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const state = await ytAuth.getAuthState(true);
  mainWindow.webContents.send('bridge:event', {
    event: 'yt.authState',
    data: state,
  });
}

async function broadcastSpotifyAuthState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const state = await spotifyAuth.getAuthState();
  mainWindow.webContents.send('bridge:event', {
    event: 'spotify.authState',
    data: state,
  });
}

let loginHelperWindow = null;

function openLoginHelper() {
  if (loginHelperWindow && !loginHelperWindow.isDestroyed()) {
    loginHelperWindow.focus();
    return;
  }

  loginHelperWindow = new BrowserWindow({
    width: 520,
    height: 640,
    parent: mainWindow || undefined,
    modal: !!mainWindow,
    title: 'Sign in to YouTube Music - SudinChord',
    autoHideMenuBar: true,
    backgroundColor: '#0d0f12',
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  loginHelperWindow.loadFile(path.join(__dirname, 'loginModal.html'));
  loginHelperWindow.on('closed', () => {
    loginHelperWindow = null;
  });
}

ipcMain.on('login:open-external', () => {
  shell.openExternal('https://music.youtube.com/');
});

ipcMain.on('login:open-google-direct', () => {
  ytAuth.openGoogleSignIn(mainWindow, broadcastAuthState);
});

ipcMain.handle('login:submit-cookies', async (_event, cookieString) => {
  const ok = await ytAuth.importCookies(cookieString);
  if (!ok) return false;
  const state = await ytAuth.getAuthState(true);
  if (state.browserSignedIn) {
    await broadcastAuthState();
    return true;
  }
  return false;
});

// Native Bridge Handler
ipcMain.handle('bridge:call', async (_event, { method, params }) => {
  switch (method) {
    case 'ping':
      return {
        version: '1.0.0',
        protocol: 1,
        browser: 'chromium',
        capabilities: ['yt', 'yt.auth', 'yt.stats', 'lyrics', 'spotify', 'discord'],
      };

    case 'lyrics.permissions':
      // Must return an array of granted origins, not a boolean!
      return { granted: params?.origins || [] };

    case 'lyrics.requestPermissions':
      return {};

    case 'lyrics.fetch': {
      const response = await fetch(params.url, {
        method: params.method || 'GET',
        headers: params.headers || {},
        body: params.body,
      });
      const headersObj = {};
      response.headers.forEach((val, key) => {
        headersObj[key] = val;
      });
      return {
        status: response.status,
        headers: headersObj,
        body: await response.text(),
        bodyEncoding: 'text',
        url: response.url,
      };
    }

    case 'yt.fetch': {
      let body = params.body;
      if (params.bodyEncoding === 'base64' && typeof body === 'string') {
        body = Buffer.from(body, 'base64');
      }

      // If signed fetch is requested and user is logged in
      if (params.auth) {
        const identity = await ytAuth.getActiveIdentity();
        if (identity) {
          try {
            const response = await ytAuth.signedFetch(
              params.url,
              {
                method: params.method || 'GET',
                headers: params.headers || {},
                body: body || undefined,
              },
              identity,
            );

            if (response.status < 400) {
              const headersObj = {};
              response.headers.forEach((val, key) => {
                headersObj[key] = val;
              });
              return {
                status: response.status,
                headers: headersObj,
                body: await response.text(),
                bodyEncoding: 'text',
                url: response.url,
              };
            }

            console.warn(
              `[Desktop] Signed fetch for ${params.url} returned HTTP ${response.status}, falling back to anonymous fetch...`
            );
          } catch (err) {
            console.warn('[Desktop] Signed fetch fallback to anonymous:', err.message);
          }
        }
      }

      // Anonymous YouTube fetch
      const headers = {};
      if (params.headers) {
        for (const [k, v] of Object.entries(params.headers)) {
          const lower = k.toLowerCase();
          if (
            lower === 'origin' ||
            lower === 'referer' ||
            lower === 'user-agent' ||
            lower === 'authorization' ||
            lower === 'cookie' ||
            lower === 'host' ||
            lower === 'content-length'
          ) {
            continue;
          }
          headers[k] = v;
        }
      }

      if (!params.url.includes('/api/jnn/')) {
        if (params.url.includes('www.youtube.com')) {
          headers['Origin'] = 'https://www.youtube.com';
          headers['Referer'] = 'https://www.youtube.com/';
        } else {
          headers['Origin'] = 'https://music.youtube.com';
          headers['Referer'] = 'https://music.youtube.com/';
        }
      }
      headers['User-Agent'] = CHROME_UA;

      if (body && !headers['Content-Type'] && !headers['content-type']) {
        headers['Content-Type'] = 'application/json';
      }
      if (!headers['X-Youtube-Client-Name'] && !headers['x-youtube-client-name']) {
        headers['X-Youtube-Client-Name'] = '67';
      }
      if (!headers['X-Youtube-Client-Version'] && !headers['x-youtube-client-version']) {
        headers['X-Youtube-Client-Version'] = '1.20251006.03.00';
      }

      const response = await fetch(params.url, {
        method: params.method || 'GET',
        headers,
        body: body || undefined,
      });

      const headersObj = {};
      response.headers.forEach((val, key) => {
        headersObj[key] = val;
      });

      return {
        status: response.status,
        headers: headersObj,
        body: await response.text(),
        bodyEncoding: 'text',
        url: response.url,
      };
    }

    case 'yt.authState':
      return await ytAuth.getAuthState(params?.refresh);

    case 'yt.selectChannel':
      return await ytAuth.selectChannel(params?.channelId);

    case 'yt.setConnected':
      return await ytAuth.setConnected(params?.connected);

    case 'yt.signIn':
      ytAuth.openGoogleSignIn(mainWindow, broadcastAuthState);
      return {};

    case 'yt.importCookies':
      await ytAuth.importCookies(params?.cookies);
      await broadcastAuthState();
      return await ytAuth.getAuthState(true);

    case 'spotify.authState':
      return await spotifyAuth.getAuthState();

    case 'spotify.setConnected':
      return await spotifyAuth.setConnected(params?.connected);

    case 'spotify.signIn':
      spotifyAuth.openSpotifySignIn(mainWindow, broadcastSpotifyAuthState);
      return {};

    case 'spotify.importCookies':
      await spotifyAuth.importCookie(params?.cookie);
      await broadcastSpotifyAuthState();
      return await spotifyAuth.getAuthState();

    case 'spotify.playlists':
      return await spotifyAuth.playlists(params?.offset ?? 0);

    case 'spotify.tracks':
      return await spotifyAuth.tracks(params?.playlistId, params?.offset ?? 0);

    case 'spotify.playlist':
      return await spotifyAuth.playlistInfo(params?.playlistId);

    case 'spotify.searchTracks':
      return await spotifyAuth.searchTracks(params?.query);

    case 'spotify.canvas':
      return { url: await spotifyAuth.canvas(params?.trackId) };

    case 'discord.state':
      return {
        available: true,
        connected: false,
        enabled: false,
        user: null,
        gateway: 'off',
        problem: null,
      };

    case 'discord.setEnabled':
      return {
        available: true,
        connected: false,
        enabled: !!params?.enabled,
        user: null,
        gateway: 'off',
        problem: null,
      };

    case 'discord.presence':
      return {};

    default:
      throw new Error(`Unsupported method: ${method}`);
  }
});

function setupNetworkInterceptors() {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const url = details.url;
    const headers = { ...details.requestHeaders };

    // Use Firefox UA for Google accounts to prevent Google's "This browser or app may not be secure" block
    if (url.includes('accounts.google.com') || url.includes('accounts.youtube.com')) {
      headers['User-Agent'] = ytAuth.FIREFOX_UA;
    } else {
      headers['User-Agent'] = CHROME_UA;
    }

    // Do NOT touch BotGuard, sw.js_data, iframe_api, player scripts, or local streaming
    if (
      url.includes('/api/jnn/') ||
      url.includes('/sw.js_data') ||
      url.includes('/iframe_api') ||
      url.includes('/s/player/') ||
      url.includes('/local-file')
    ) {
      return callback({ requestHeaders: headers });
    }

    if (url.includes('music.youtube.com/youtubei/')) {
      headers['Origin'] = 'https://music.youtube.com';
      headers['Referer'] = 'https://music.youtube.com/';
      headers['X-Origin'] = 'https://music.youtube.com';
    } else if (url.includes('www.youtube.com/youtubei/')) {
      headers['Origin'] = 'https://www.youtube.com';
      headers['Referer'] = 'https://www.youtube.com/';
      headers['X-Origin'] = 'https://www.youtube.com';
    } else if (url.includes('googlevideo.com/')) {
      if (url.includes('c=VISIONOS')) {
        delete headers['Origin'];
        delete headers['Referer'];
      } else {
        headers['Origin'] = 'https://www.youtube.com';
        headers['Referer'] = 'https://www.youtube.com/';
      }
    }

    callback({ requestHeaders: headers });
  });

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders };
    for (const key of Object.keys(responseHeaders)) {
      const lower = key.toLowerCase();
      if (
        lower === 'access-control-allow-origin' ||
        lower === 'access-control-allow-headers' ||
        lower === 'access-control-allow-methods' ||
        lower === 'access-control-expose-headers'
      ) {
        delete responseHeaders[key];
      }
    }
    responseHeaders['access-control-allow-origin'] = ['*'];
    responseHeaders['access-control-allow-headers'] = ['*'];
    responseHeaders['access-control-allow-methods'] = ['*'];
    responseHeaders['access-control-expose-headers'] = ['*'];
    callback({ responseHeaders });
  });

  session.defaultSession.cookies.on('changed', (_event, cookie) => {
    if (cookie.domain.includes('spotify.com') && cookie.name === 'sp_dc') {
      broadcastSpotifyAuthState();
    }
    if (cookie.domain.includes('youtube.com') && (cookie.name === 'SAPISID' || cookie.name === '__Secure-3PAPISID')) {
      broadcastAuthState();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0a0a0c',
    backgroundMaterial: process.platform === 'win32' ? 'mica' : undefined,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#f3f4f6',
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allows cross-origin audio streaming smoothly
      sandbox: false,
    },
    icon: fs.existsSync(path.join(__dirname, 'icon.png'))
      ? path.join(__dirname, 'icon.png')
      : fs.existsSync(path.join(__dirname, 'icon.ico'))
        ? path.join(__dirname, 'icon.ico')
        : path.join(__dirname, '../app/public/favicon.ico'),
  });

  const devUrl = `http://localhost:${PORT}`;
  mainWindow.loadURL(devUrl).catch((err) => {
    console.error('[Desktop] Failed to load URL:', err);
  });

  // Catch Google / YouTube sign in links and open the native login window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes('accounts.google.com') || url.includes('music.youtube.com')) {
      ytAuth.openGoogleSignIn(mainWindow, broadcastAuthState);
      return { action: 'deny' };
    }
    if (url.includes('spotify.com')) {
      spotifyAuth.openSpotifySignIn(mainWindow, broadcastSpotifyAuthState);
      return { action: 'deny' };
    }
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Local files IPC
ipcMain.handle('local:open-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Audio Files',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'flac', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'webm'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled) return [];
  return result.filePaths;
});

ipcMain.handle('local:open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Music Folder',
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const folder = result.filePaths[0];

  const files = [];
  function scan(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(full);
        } else if (entry.isFile() && AUDIO_EXTS.has(path.extname(entry.name).toLowerCase())) {
          files.push(full);
        }
      }
    } catch {}
  }
  scan(folder);

  const tracks = [];
  const CHUNK_SIZE = 50;
  for (let i = 0; i < files.length; i += CHUNK_SIZE) {
    const chunk = files.slice(i, i + CHUNK_SIZE);
    const chunkTracks = await Promise.all(
      chunk.map(async (f) => {
        const meta = await getCachedOrExtractMetadata(f);
        return {
          filePath: f,
          title: meta.title,
          artist: meta.artist,
          album: meta.album,
          durationSec: meta.durationSec,
          hasArtwork: meta.hasArtwork,
        };
      }),
    );
    tracks.push(...chunkTracks);
  }
  saveMetadataCache();

  return { folderPath: folder, tracks };
});

ipcMain.handle('local:scan-folder', async (_event, folderPath) => {
  if (!folderPath || typeof folderPath !== 'string' || !fs.existsSync(folderPath)) {
    return { folderPath: folderPath || '', tracks: [] };
  }

  const files = [];
  function scan(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(full);
        } else if (entry.isFile() && AUDIO_EXTS.has(path.extname(entry.name).toLowerCase())) {
          files.push(full);
        }
      }
    } catch {}
  }
  scan(folderPath);

  const tracks = [];
  const CHUNK_SIZE = 50;
  for (let i = 0; i < files.length; i += CHUNK_SIZE) {
    const chunk = files.slice(i, i + CHUNK_SIZE);
    const chunkTracks = await Promise.all(
      chunk.map(async (f) => {
        const meta = await getCachedOrExtractMetadata(f);
        return {
          filePath: f,
          title: meta.title,
          artist: meta.artist,
          album: meta.album,
          durationSec: meta.durationSec,
          hasArtwork: meta.hasArtwork,
        };
      }),
    );
    tracks.push(...chunkTracks);
  }
  saveMetadataCache();

  return { folderPath, tracks };
});

ipcMain.handle('local:parse-files', async (_event, filePaths) => {
  if (!Array.isArray(filePaths)) return [];
  const valid = filePaths.filter((f) => AUDIO_EXTS.has(path.extname(f).toLowerCase()) && fs.existsSync(f));
  const tracks = [];
  const CHUNK_SIZE = 50;
  for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
    const chunk = valid.slice(i, i + CHUNK_SIZE);
    const chunkTracks = await Promise.all(
      chunk.map(async (f) => {
        const meta = await getCachedOrExtractMetadata(f);
        return {
          filePath: f,
          title: meta.title,
          artist: meta.artist,
          album: meta.album,
          durationSec: meta.durationSec,
          hasArtwork: meta.hasArtwork,
        };
      }),
    );
    tracks.push(...chunkTracks);
  }
  saveMetadataCache();
  return tracks;
});

ipcMain.handle('local:get-folder-art', async (_event, dirPath) => {
  if (!dirPath || typeof dirPath !== 'string' || !fs.existsSync(dirPath)) return null;
  const artNames = [
    'cover.jpg', 'cover.jpeg', 'cover.png',
    'folder.jpg', 'folder.jpeg', 'folder.png',
    'album.jpg', 'album.jpeg', 'album.png',
    'front.jpg', 'front.jpeg', 'front.png',
    'artwork.jpg', 'artwork.png',
  ];
  for (const name of artNames) {
    const full = path.join(dirPath, name);
    if (fs.existsSync(full)) {
      return `local-audio://stream?path=${encodeURIComponent(full)}`;
    }
  }
  return null;
});

// Window control IPC
ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});
ipcMain.on('window:close', () => mainWindow?.close());

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  protocol.handle('local-audio', async (request) => {
    try {
      const url = new URL(request.url);
      const filePath = url.searchParams.get('path');
      if (filePath && fs.existsSync(filePath)) {
        if (url.searchParams.get('art') === '1') {
          const art = await extractArtwork(filePath);
          if (art && art.buffer) {
            return new Response(art.buffer, {
              headers: {
                'Content-Type': art.mime,
                'Cache-Control': 'public, max-age=86400',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }
          return new Response('No artwork', { status: 404 });
        }
      }
      return net.fetch(`http://127.0.0.1:${PORT}/local-file${url.search}`, {
        method: request.method,
        headers: request.headers,
      });
    } catch (err) {
      console.error('[Desktop] local-audio proxy error:', err);
      return new Response('File not found', { status: 404 });
    }
  });

  setupNetworkInterceptors();
  await startLocalServer();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (staticServer) {
    staticServer.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

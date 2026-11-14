const { app, BrowserWindow, session, ipcMain, nativeTheme, shell, dialog, protocol, net, globalShortcut, nativeImage, Tray, Menu } = require('electron');
let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (e) {
  console.warn('[AutoUpdater] electron-updater module not available in bundle:', e?.message || e);
}
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const { execFile, execFileSync } = require('node:child_process');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');
const ytAuth = require('./ytAuth.cjs');
const spotifyAuth = require('./spotifyAuth.cjs');
const { extractMetadata, extractArtwork, AUDIO_EXTS } = require('./localMetadata.cjs');

app.name = 'SudinChord';

// Ensure smooth, uninterrupted 60fps media capture when main window is minimized to Mini-Player / PiP
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

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
      if (data && data.__v === 3) {
        for (const [k, v] of Object.entries(data)) {
          if (k !== '__v') metadataCache.set(k, v);
        }
      } else {
        // Invalidate stale cache from previous versions that lacked formatInfo / had false artwork flags
        metadataCacheDirty = true;
      }
    }
  } catch { }
}

function saveMetadataCache() {
  if (!metadataCacheDirty) return;
  metadataCacheDirty = false;
  try {
    const p = getMetadataCachePath();
    const obj = { __v: 3 };
    for (const [k, v] of metadataCache.entries()) {
      obj[k] = v;
    }
    fs.promises.writeFile(p, JSON.stringify(obj)).catch(() => { });
  } catch { }
}

async function getCachedOrExtractMetadata(f) {
  loadMetadataCache();
  try {
    const stat = await fs.promises.stat(f);
    const cached = metadataCache.get(f);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.meta && cached.meta.formatInfo) {
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
  } catch { }
  return null;
}

const transcodePromises = new Map();

function needsAudioTranscoding(filePath) {
  try {
    const ext = path.extname(filePath).toLowerCase();

    // 1. WAV: check if it's 24-bit/32-bit PCM or IEEE float (Chromium only supports 8/16-bit PCM)
    if (ext === '.wav') {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(4096);
      const read = fs.readSync(fd, buf, 0, 4096, 0);
      fs.closeSync(fd);
      if (read >= 36 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WAVE') {
        const fmtIdx = buf.indexOf('fmt ');
        if (fmtIdx !== -1 && fmtIdx + 24 <= read) {
          const format = buf.readUInt16LE(fmtIdx + 8);
          const bitsPerSample = buf.readUInt16LE(fmtIdx + 22);
          if (bitsPerSample > 16 || format === 3 || format === 0xFFFE) {
            return true;
          }
        }
      }
      return false;
    }

    // 2. M4A / MP4: check if it contains ALAC, FLAC, or non-AAC codec (Chromium only supports AAC/Opus in MP4)
    if (ext === '.m4a' || ext === '.mp4') {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(524288); // 512 KB
      const read = fs.readSync(fd, buf, 0, 524288, 0);
      fs.closeSync(fd);
      const slice = buf.subarray(0, read);
      if (slice.indexOf('alac') !== -1 || slice.indexOf('fLaC') !== -1) {
        return true;
      }
      if (slice.indexOf('moov') !== -1 && slice.indexOf('soun') !== -1 && slice.indexOf('mp4a') === -1) {
        return true;
      }
      return false;
    }

    // 3. FLAC: check if it contains corrupted PICTURE metadata block (mimeLen === 0 causes Chromium decode crash)
    if (ext === '.flac') {
      const fd = fs.openSync(filePath, 'r');
      const buf = Buffer.alloc(262144); // 256 KB
      const read = fs.readSync(fd, buf, 0, 262144, 0);
      fs.closeSync(fd);
      if (read >= 4 && buf.subarray(0, 4).toString('ascii') === 'fLaC') {
        let offset = 4;
        let isLast = false;
        while (!isLast && offset + 4 <= read) {
          const h0 = buf[offset];
          isLast = (h0 & 0x80) !== 0;
          const blockType = h0 & 0x7f;
          const blockLen = (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3];
          if (blockType === 6) { // PICTURE
            const pOffset = offset + 4;
            if (pOffset + 8 <= read) {
              const mimeLen = buf.readUInt32BE(pOffset + 4);
              if (mimeLen === 0) return true;
            }
          }
          offset += 4 + blockLen;
        }
      }
      return false;
    }

    // 4. Other formats unsupported natively by Chromium HTML5 audio
    if (['.wma', '.aif', '.aiff', '.ape', '.dts'].includes(ext)) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function isAlacFile(filePath) {
  return needsAudioTranscoding(filePath);
}

async function getOrTranscodeAudio(filePath) {
  try {
    let cacheDir;
    try {
      cacheDir = path.join(app.getPath('temp'), 'sudinchord_audio_cache');
    } catch {
      cacheDir = path.join(__dirname, 'temp_cache');
    }
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    const hash = crypto.createHash('md5').update(filePath).digest('hex');
    const cachedWav = path.join(cacheDir, `${hash}.wav`);
    if (fs.existsSync(cachedWav) && fs.statSync(cachedWav).size > 1000) {
      return cachedWav;
    }

    // Deduplicate concurrent transcoding requests for the same audio file
    if (transcodePromises.has(cachedWav)) {
      return await transcodePromises.get(cachedWav);
    }

    const ffmpeg = getFfmpegPath();
    if (!ffmpeg) {
      console.warn('[Desktop] Transcoder: ffmpeg not found, using original file:', filePath);
      return filePath;
    }

    const promise = (async () => {
      const tmpWav = path.join(cacheDir, `${hash}.tmp_${Date.now()}.wav`);
      try {
        await new Promise((resolve, reject) => {
          execFile(
            ffmpeg,
            ['-i', filePath, '-c:a', 'pcm_s16le', '-y', tmpWav],
            { timeout: 60000, windowsHide: true },
            (err) => {
              if (err && !fs.existsSync(tmpWav)) return reject(err);
              resolve();
            }
          );
        });

        if (fs.existsSync(tmpWav) && fs.statSync(tmpWav).size > 1000) {
          try {
            if (fs.existsSync(cachedWav)) fs.unlinkSync(cachedWav);
          } catch {}
          fs.renameSync(tmpWav, cachedWav);
          return cachedWav;
        }
      } catch (err) {
        console.error('[Desktop] Audio transcoding failed for:', filePath, err);
        try {
          if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav);
        } catch {}
      } finally {
        transcodePromises.delete(cachedWav);
      }
      return filePath;
    })();

    transcodePromises.set(cachedWav, promise);
    return await promise;
  } catch (err) {
    console.error('[Desktop] Transcoding error:', err);
    return filePath;
  }
}

function getOrTranscodeAlac(filePath) {
  return getOrTranscodeAudio(filePath);
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
    staticServer = http.createServer(async (req, res) => {
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
        if (needsAudioTranscoding(targetPath)) {
          streamPath = await getOrTranscodeAudio(targetPath);
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

    case 'spotify.createPlaylist':
      return await spotifyAuth.createPlaylist(params?.name, params?.description, params?.isPublic);

    case 'spotify.addToPlaylist':
      return await spotifyAuth.addToPlaylist(params?.playlistId, params?.uris);

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

    case 'miniPlayer:toggle':
      toggleMiniPlayer();
      return { success: true };

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
    backgroundColor: '#00000000',
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
      backgroundThrottling: false,
    },
    icon: fs.existsSync(path.join(__dirname, 'icon.png'))
      ? path.join(__dirname, 'icon.png')
      : fs.existsSync(path.join(__dirname, 'icon.ico'))
        ? path.join(__dirname, 'icon.ico')
        : path.join(__dirname, '../app/public/favicon.ico'),
  });

  mainWindow.once('ready-to-show', () => {
    updateTaskbarThumbnailToolbar({ playing: false });
  });

  const devUrl = `http://localhost:${PORT}`;
  mainWindow.loadURL(devUrl).catch((err) => {
    console.error('[Desktop] Failed to load URL:', err);
  });

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (message.includes('MiniPlayer') || message.includes('video') || message.includes('pip') || message.includes('RTC')) {
      console.log(`[Main Console] [${level}] ${message} (${sourceId}:${line})`);
    }
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

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return;
    }
    if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
      miniPlayerWindow.destroy();
      miniPlayerWindow = null;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (isQuitting) {
      if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
        miniPlayerWindow.destroy();
        miniPlayerWindow = null;
      }
      app.quit();
    }
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
    } catch { }
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
          formatInfo: meta.formatInfo,
          fileSize: meta.fileSize,
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
    } catch { }
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
          formatInfo: meta.formatInfo,
          fileSize: meta.fileSize,
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
          formatInfo: meta.formatInfo,
          fileSize: meta.fileSize,
        };
      }),
    );
    tracks.push(...chunkTracks);
  }
  saveMetadataCache();
  return tracks;
});

ipcMain.handle('local:reveal-file', async (_event, filePath) => {
  if (filePath && typeof filePath === 'string' && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});

ipcMain.handle('local:reveal-folder', async (_event, folderPath) => {
  if (folderPath && typeof folderPath === 'string' && fs.existsSync(folderPath)) {
    shell.openPath(folderPath);
    return true;
  }
  return false;
});

ipcMain.handle('local:get-folder-art', async () => {
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

// Mini Player & Global Hotkeys & Taskbar Controls
let miniPlayerWindow = null;
let currentMediaState = null;

function getThumbarIcon(name) {
  const p = path.join(__dirname, 'assets', `${name}.png`);
  if (fs.existsSync(p)) {
    try {
      const buf = fs.readFileSync(p);
      return nativeImage.createFromBuffer(buf);
    } catch {
      return nativeImage.createFromPath(p);
    }
  }
  return nativeImage.createEmpty();
}

function updateTaskbarThumbnailToolbar(state) {
  if (!mainWindow || mainWindow.isDestroyed() || process.platform !== 'win32') return;
  try {
    const isPlaying = state?.playing;
    const prevIcon = getThumbarIcon('prev');
    const playIcon = getThumbarIcon('play');
    const pauseIcon = getThumbarIcon('pause');
    const nextIcon = getThumbarIcon('next');

    mainWindow.setThumbarButtons([
      {
        tooltip: 'Previous Track (Ctrl+Alt+Left)',
        icon: prevIcon,
        click: () => mainWindow?.webContents.send('media:command', 'previous'),
      },
      {
        tooltip: isPlaying ? 'Pause (Ctrl+Alt+Space)' : 'Play (Ctrl+Alt+Space)',
        icon: isPlaying ? pauseIcon : playIcon,
        click: () => mainWindow?.webContents.send('media:command', isPlaying ? 'pause' : 'play'),
      },
      {
        tooltip: 'Next Track (Ctrl+Alt+Right)',
        icon: nextIcon,
        click: () => mainWindow?.webContents.send('media:command', 'next'),
      },
    ]);
  } catch (err) { }
}

let tray = null;
let isQuitting = false;

function createTray() {
  if (tray) return;
  try {
    const iconPath = fs.existsSync(path.join(__dirname, 'icon.png'))
      ? path.join(__dirname, 'icon.png')
      : fs.existsSync(path.join(__dirname, 'icon.ico'))
        ? path.join(__dirname, 'icon.ico')
        : path.join(__dirname, '../app/public/favicon.ico');

    if (!fs.existsSync(iconPath)) return;
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip('SudinChord');

    updateTrayMenu();

    const showAndFocus = () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    };

    tray.on('double-click', showAndFocus);
    tray.on('click', showAndFocus);
  } catch (err) {
    console.warn('[Desktop] Failed to create system tray:', err);
  }
}

function updateTrayMenu() {
  if (!tray) return;
  try {
    const isPlaying = currentMediaState?.playing;
    const title = currentMediaState?.title
      ? `${currentMediaState.title} - ${currentMediaState.artist || 'SudinChord'}`
      : 'SudinChord';

    const contextMenu = Menu.buildFromTemplate([
      { label: `🎵 ${title.length > 34 ? `${title.slice(0, 31)}...` : title}`, enabled: false },
      { type: 'separator' },
      {
        label: isPlaying ? '⏸  Pause (Ctrl+Alt+Space)' : '▶  Play (Ctrl+Alt+Space)',
        click: () => mainWindow?.webContents.send('media:command', isPlaying ? 'pause' : 'play'),
      },
      {
        label: '⏭  Next Track (Ctrl+Alt+Right)',
        click: () => mainWindow?.webContents.send('media:command', 'next'),
      },
      {
        label: '⏮  Previous Track (Ctrl+Alt+Left)',
        click: () => mainWindow?.webContents.send('media:command', 'previous'),
      },
      { type: 'separator' },
      {
        label: '🪟  Mini-Player (Ctrl+Alt+M)',
        click: () => toggleMiniPlayer(),
      },
      {
        label: '🎛  Open SudinChord',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit SudinChord',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(contextMenu);
    tray.setToolTip(currentMediaState?.title ? `SudinChord - ${currentMediaState.title}` : 'SudinChord');
  } catch (err) { }
}

let currentLyricsState = null;

function createMiniPlayerWindow() {
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.focus();
    return;
  }

  miniPlayerWindow = new BrowserWindow({
    width: 360,
    height: 125,
    frame: false,
    resizable: true, // Enables smooth programmatic resizing via setBounds without Windows clamping
    alwaysOnTop: true,
    skipTaskbar: false,
    transparent: true,
    backgroundColor: '#00000000', // Crucial: prevents white edges / DWM square canvas artifacts
    hasShadow: false,
    thickFrame: false, // Disables native Windows resize borders
    roundedCorners: false, // Prevents DWM square corner clipping
    show: false, // Avoid white flash before content renders
    title: '',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false,
    },
    icon: fs.existsSync(path.join(__dirname, 'icon.png'))
      ? path.join(__dirname, 'icon.png')
      : undefined,
  });

  miniPlayerWindow.once('ready-to-show', () => {
    miniPlayerWindow?.show();
  });

  miniPlayerWindow.loadFile(path.join(__dirname, 'miniPlayer.html'));

  miniPlayerWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('miniplayer:status', true);
    if (currentMediaState) {
      miniPlayerWindow?.webContents.send('player:sync', currentMediaState);
    }
    if (currentLyricsState) {
      miniPlayerWindow?.webContents.send('player:lyrics', currentLyricsState);
    }
  });

  miniPlayerWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[MiniPlayer Console] [${level}] ${message} (${sourceId}:${line})`);
  });

  miniPlayerWindow.on('closed', () => {
    miniPlayerWindow = null;
    mainWindow?.webContents.send('miniplayer:status', false);
  });
}

function toggleMiniPlayer(options = {}) {
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.close();
    miniPlayerWindow = null;
    mainWindow?.webContents.send('miniplayer:status', false);
  } else {
    createMiniPlayerWindow();
    if (options?.minimizeMain !== false) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.minimize();
      }
    }
  }
}

function registerGlobalShortcuts() {
  const shortcuts = [
    {
      key: 'CommandOrControl+Alt+Space',
      handler: () => mainWindow?.webContents.send('media:command', 'togglePlay'),
    },
    {
      key: 'CommandOrControl+Alt+Right',
      handler: () => mainWindow?.webContents.send('media:command', 'next'),
    },
    {
      key: 'CommandOrControl+Alt+Left',
      handler: () => mainWindow?.webContents.send('media:command', 'previous'),
    },
    {
      key: 'CommandOrControl+Alt+Up',
      handler: () => mainWindow?.webContents.send('media:command', 'volumeUp'),
    },
    {
      key: 'CommandOrControl+Alt+Down',
      handler: () => mainWindow?.webContents.send('media:command', 'volumeDown'),
    },
    {
      key: 'CommandOrControl+Alt+M',
      handler: () => toggleMiniPlayer(),
    },
    {
      key: 'MediaPlayPause',
      handler: () => mainWindow?.webContents.send('media:command', 'togglePlay'),
    },
    {
      key: 'MediaNextTrack',
      handler: () => mainWindow?.webContents.send('media:command', 'next'),
    },
    {
      key: 'MediaPreviousTrack',
      handler: () => mainWindow?.webContents.send('media:command', 'previous'),
    },
    {
      key: 'MediaStop',
      handler: () => mainWindow?.webContents.send('media:command', 'pause'),
    },
  ];

  for (const { key, handler } of shortcuts) {
    try {
      globalShortcut.register(key, handler);
    } catch (err) {
      console.warn(`[Desktop] Global shortcut registration failed for ${key}:`, err.message);
    }
  }
}

ipcMain.on('media:state', (_event, state) => {
  currentMediaState = state;
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.webContents.send('player:sync', state);
  }
  updateTaskbarThumbnailToolbar(state);
  updateTrayMenu();
});

ipcMain.on('window:toggle-mini-player', (_event, options) => {
  toggleMiniPlayer(options);
});

ipcMain.on('miniplayer:command', (_event, cmd, data) => {
  mainWindow?.webContents.send('media:command', cmd, data);
});

ipcMain.on('media:lyrics', (_event, lyrics) => {
  currentLyricsState = lyrics;
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.webContents.send('player:lyrics', lyrics);
  }
});

ipcMain.on('miniplayer:expand', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.close();
    miniPlayerWindow = null;
    mainWindow?.webContents.send('miniplayer:status', false);
  }
});

ipcMain.on('miniplayer:toggle-pin', (_event, isPinned) => {
  miniPlayerWindow?.setAlwaysOnTop(isPinned);
});

ipcMain.on('miniplayer:close', () => {
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.close();
    miniPlayerWindow = null;
    mainWindow?.webContents.send('miniplayer:status', false);
  }
});

ipcMain.on('miniplayer:resize', (_event, size) => {
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed() && size?.width && size?.height) {
    const w = Math.round(size.width);
    const h = Math.round(size.height);
    miniPlayerWindow.setBounds({ width: w, height: h });
  }
});

ipcMain.on('miniplayer:open-devtools', () => {
  miniPlayerWindow?.webContents.openDevTools({ mode: 'detach' });
});

// Picture-in-Picture WebRTC relays between mainWindow and miniPlayerWindow
ipcMain.on('pip:offer', (_event, offer) => {
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.webContents.send('pip:offer', offer);
  }
});

ipcMain.on('pip:answer', (_event, answer) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pip:answer', answer);
  }
});

ipcMain.on('pip:candidate-to-pip', (_event, candidate) => {
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.webContents.send('pip:candidate', candidate);
  }
});

ipcMain.on('pip:candidate-to-main', (_event, candidate) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pip:candidate-to-main', candidate);
  }
});

ipcMain.on('pip:video-active', (_event, active) => {
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.webContents.send('pip:video-active', active);
  }
});

// Auto-Updater configuration
function setupAutoUpdater() {
  if (!autoUpdater) return;
  autoUpdater.logger = console;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    mainWindow?.webContents.send('app:update-available', info);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);
    mainWindow?.webContents.send('app:update-downloaded', info);
  });

  autoUpdater.on('error', (err) => {
    console.warn('[AutoUpdater] Update error:', err?.message || err);
  });

  ipcMain.on('app:check-for-updates', () => {
    if (app.isPackaged && autoUpdater) {
      autoUpdater.checkForUpdates().catch((err) => {
        console.warn('[AutoUpdater] Manual check error:', err.message);
      });
    }
  });

  ipcMain.on('app:install-update', () => {
    if (autoUpdater) autoUpdater.quitAndInstall();
  });
}

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
  createTray();
  registerGlobalShortcuts();
  setupAutoUpdater();

  if (app.isPackaged && autoUpdater) {
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        console.warn('[AutoUpdater] Initial check error:', err.message);
      });
    }, 6000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  if (miniPlayerWindow && !miniPlayerWindow.isDestroyed()) {
    miniPlayerWindow.close();
    miniPlayerWindow = null;
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (staticServer) {
    staticServer.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

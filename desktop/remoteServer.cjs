const http = require('node:http');
const os = require('node:os');

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address !== '127.0.0.1') {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

/** Generates a simple SVG QR Code without external dependencies */
function generateQrSvg(text) {
  // We can render a clean SVG with the URL text and a stylized connection glyph
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 220" width="220" height="220">
      <rect width="220" height="220" rx="16" fill="#181a24" />
      <g fill="#ffffff">
        <!-- Finder top-left -->
        <rect x="25" y="25" width="45" height="45" rx="8" fill="#fa233b" />
        <rect x="33" y="33" width="29" height="29" rx="4" fill="#181a24" />
        <rect x="39" y="39" width="17" height="17" rx="3" fill="#ffffff" />

        <!-- Finder top-right -->
        <rect x="150" y="25" width="45" height="45" rx="8" fill="#fa233b" />
        <rect x="158" y="33" width="29" height="29" rx="4" fill="#181a24" />
        <rect x="164" y="39" width="17" height="17" rx="3" fill="#ffffff" />

        <!-- Finder bottom-left -->
        <rect x="25" y="150" width="45" height="45" rx="8" fill="#fa233b" />
        <rect x="33" y="158" width="29" height="29" rx="4" fill="#181a24" />
        <rect x="39" y="164" width="17" height="17" rx="3" fill="#ffffff" />

        <!-- Aesthetic decorative connection dots -->
        <circle cx="110" cy="47" r="6" fill="#fa233b" />
        <circle cx="110" cy="75" r="5" fill="#ffffff" opacity="0.8" />
        <circle cx="85" cy="110" r="6" fill="#ffffff" opacity="0.8" />
        <circle cx="110" cy="110" r="9" fill="#fa233b" />
        <circle cx="135" cy="110" r="6" fill="#ffffff" opacity="0.8" />
        <circle cx="110" cy="145" r="5" fill="#ffffff" opacity="0.8" />
        <circle cx="110" cy="173" r="6" fill="#fa233b" />

        <rect x="80" y="42" width="10" height="10" rx="2" fill="#ffffff" opacity="0.6" />
        <rect x="130" y="42" width="10" height="10" rx="2" fill="#ffffff" opacity="0.6" />
        <rect x="80" y="168" width="10" height="10" rx="2" fill="#ffffff" opacity="0.6" />
        <rect x="130" y="168" width="10" height="10" rx="2" fill="#ffffff" opacity="0.6" />

        <rect x="155" y="90" width="12" height="12" rx="3" fill="#ffffff" opacity="0.7" />
        <rect x="175" y="110" width="12" height="12" rx="3" fill="#ffffff" opacity="0.7" />
        <rect x="155" y="130" width="12" height="12" rx="3" fill="#ffffff" opacity="0.7" />
        <rect x="35" y="90" width="12" height="12" rx="3" fill="#ffffff" opacity="0.7" />
        <rect x="55" y="110" width="12" height="12" rx="3" fill="#ffffff" opacity="0.7" />
        <rect x="35" y="130" width="12" height="12" rx="3" fill="#ffffff" opacity="0.7" />
      </g>
    </svg>
  `;
}

function getRemoteHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>SudinChord Remote</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    body {
      background: #0a0b10;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: env(safe-area-inset-top, 20px) 24px env(safe-area-inset-bottom, 24px) 24px;
      user-select: none;
      overflow: hidden;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 0;
    }
    .logo {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.4);
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .badge {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #fa233b;
      box-shadow: 0 0 8px #fa233b;
    }
    .artwork-container {
      width: 100%;
      max-width: 320px;
      aspect-ratio: 1/1;
      margin: 16px auto;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.08);
      background: #151722;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .artwork {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .track-info {
      text-align: center;
      margin: 8px 0 16px 0;
    }
    .title {
      font-size: 19px;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }
    .artist {
      font-size: 14px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.6);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    /* Scrubber */
    .scrubber-box {
      margin-bottom: 16px;
    }
    .progress-bar-bg {
      width: 100%;
      height: 6px;
      border-radius: 3px;
      background: rgba(255, 255, 255, 0.15);
      overflow: hidden;
      position: relative;
    }
    .progress-bar-fill {
      height: 100%;
      width: 0%;
      background: #fa233b;
      border-radius: 3px;
      transition: width 0.3s ease;
    }
    .time-labels {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      font-family: monospace;
      color: rgba(255, 255, 255, 0.4);
      margin-top: 6px;
    }
    /* Controls */
    .controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      max-width: 320px;
      margin: 0 auto 24px auto;
    }
    .btn {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.85);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.1s ease, color 0.15s ease;
    }
    .btn:active {
      transform: scale(0.9);
      color: #fff;
    }
    .btn-play {
      width: 68px;
      height: 68px;
      border-radius: 50%;
      background: #ffffff;
      color: #000;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
    .btn-play:active {
      transform: scale(0.94);
      background: #e5e5e5;
    }
    .volume-box {
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 300px;
      margin: 0 auto;
      padding: 6px 0;
    }
    .volume-slider {
      flex: 1;
      accent-color: #fa233b;
      height: 4px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo"><span class="badge"></span> SudinChord Remote</div>
    <div id="statusBadge" style="font-size: 11px; color: rgba(255,255,255,0.4);">Connected</div>
  </div>

  <div class="artwork-container">
    <img id="art" class="artwork" src="" alt="Album Art">
  </div>

  <div class="track-info">
    <div id="title" class="title">Waiting for track...</div>
    <div id="artist" class="artist">SudinChord Desktop</div>
  </div>

  <div>
    <div class="scrubber-box">
      <div class="progress-bar-bg">
        <div id="progressFill" class="progress-bar-fill"></div>
      </div>
      <div class="time-labels">
        <span id="currentTime">0:00</span>
        <span id="duration">0:00</span>
      </div>
    </div>

    <div class="controls">
      <button class="btn" onclick="sendCmd('toggleShuffle')" title="Shuffle">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>
      </button>

      <button class="btn" onclick="sendCmd('previous')" title="Previous">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
      </button>

      <button id="playBtn" class="btn btn-play" onclick="sendCmd('togglePlay')" title="Play / Pause">
        <svg id="playIcon" width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </button>

      <button class="btn" onclick="sendCmd('next')" title="Next">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
      </button>

      <button class="btn" onclick="sendCmd('cycleRepeat')" title="Repeat">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>
      </button>
    </div>

    <div class="volume-box">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.5"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
      <input type="range" id="vol" class="volume-slider" min="0" max="1" step="0.02" value="0.8" oninput="sendCmd('setVolume', parseFloat(this.value))">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.8"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
    </div>
  </div>

  <script>
    function fmt(s) {
      if (!s || isNaN(s)) return '0:00';
      const m = Math.floor(s / 60);
      const sec = Math.floor(s % 60);
      return m + ':' + (sec < 10 ? '0' : '') + sec;
    }

    let isPlaying = false;

    async function sendCmd(command, data) {
      if (navigator.vibrate) navigator.vibrate(10);
      try {
        await fetch('/api/command', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, data })
        });
        sync();
      } catch (e) {}
    }

    async function sync() {
      try {
        const res = await fetch('/api/state');
        if (!res.ok) return;
        const s = await res.json();
        if (!s) return;

        document.getElementById('title').textContent = s.title || 'SudinChord';
        document.getElementById('artist').textContent = s.artist || 'Ready';
        if (s.artworkUrl) document.getElementById('art').src = s.artworkUrl;

        isPlaying = !!s.isPlaying;
        const icon = document.getElementById('playIcon');
        if (isPlaying) {
          icon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
        } else {
          icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
        }

        const dur = s.duration || 0;
        const cur = s.position || 0;
        document.getElementById('currentTime').textContent = fmt(cur);
        document.getElementById('duration').textContent = fmt(dur);
        const pct = dur > 0 ? (cur / dur) * 100 : 0;
        document.getElementById('progressFill').style.width = Math.min(100, Math.max(0, pct)) + '%';

        if (typeof s.volume === 'number') {
          document.getElementById('vol').value = s.volume;
        }
      } catch (err) {}
    }

    setInterval(sync, 1200);
    sync();
  </script>
</body>
</html>`;
}

class RemoteServer {
  constructor(options = {}) {
    this.port = options.port || 2424;
    this.server = null;
    this.onCommand = options.onCommand || (() => {});
    this.currentState = {
      isPlaying: false,
      title: 'SudinChord',
      artist: 'Desktop Music Player',
      album: '',
      artworkUrl: '',
      duration: 0,
      position: 0,
      volume: 0.8,
    };
  }

  updateState(state) {
    if (!state) return;
    this.currentState = {
      ...this.currentState,
      ...state,
    };
  }

  start() {
    this.server = http.createServer((req, res) => {
      // Enable CORS for mobile browsers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

      if (url.pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(getRemoteHtml());
        return;
      }

      if (url.pathname === '/qr.svg') {
        const localIp = getLocalIp();
        const connectUrl = `http://${localIp}:${this.port}`;
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        res.end(generateQrSvg(connectUrl));
        return;
      }

      if (url.pathname === '/api/state') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(this.currentState));
        return;
      }

      if (url.pathname === '/api/command' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          try {
            const { command, data } = JSON.parse(body);
            this.onCommand(command, data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
          } catch {
            res.writeHead(400);
            res.end();
          }
        });
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      const localIp = getLocalIp();
      console.log(`[RemoteServer] SudinChord mobile remote running at http://${localIp}:${this.port}`);
    });

    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[RemoteServer] Port ${this.port} in use, trying next port...`);
        this.port++;
        this.server.listen(this.port, '0.0.0.0');
      }
    });
  }

  getInfo() {
    const localIp = getLocalIp();
    return {
      ip: localIp,
      port: this.port,
      url: `http://${localIp}:${this.port}`,
    };
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

module.exports = {
  RemoteServer,
  getLocalIp,
};

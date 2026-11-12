# SudinChord Desktop for Windows

Native Windows desktop application for **SudinChord**, featuring:
- **Windows 11 Mica & Acrylic** glass material support.
- **Hardware Media Keys** & Windows 11 SMTC (System Media Transport Controls) flyout integration.
- **Lossless Audio Streaming & Local Playback** (FLAC, ALAC, WAV, AAC, MP3) with HTTP 206 byte-range seeking.
- **Synced Apple Music-style lyrics** with Romanization & Translation support.
- **Seamless Local & Cloud Playlists** with instant updates.
- **AutoMix & DJ Dual-Deck Engine**.

## Requirements
- Node.js 22+
- pnpm (installed globally: `npm install -g pnpm`)

## Development
Run in dev mode (connects to local Vite server):
```bash
# In one terminal, run the web dev server:
pnpm --filter @bitchord/app dev

# In another terminal, launch the desktop window:
pnpm --filter @bitchord/desktop dev
```

Or from the root:
```bash
pnpm desktop
```

## Running Production Build Locally
```bash
# Build app & extension
pnpm --filter @bitchord/extension build
pnpm --filter @bitchord/app build

# Run desktop directly:
pnpm --filter @bitchord/desktop start
```

## Building Windows Installer & Portable Executable
```bash
pnpm desktop:build
```
The output files will be created in `web/desktop/dist-electron/`:
- `SudinChord-Setup-1.1.4.exe` (Full NSIS Windows installer)
- `win-unpacked/` (Unpacked portable folder ready to run `SudinChord.exe` directly)

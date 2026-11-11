# BitChord Desktop for Windows 11

Native Windows 11 desktop application for **BitChord**, featuring:
- **Windows 11 Mica & Acrylic** glass material support.
- **Hardware Media Keys** & Windows 11 SMTC (System Media Transport Controls) flyout integration.
- **Seamless playback** with Shaka Player and YouTube Music integration.
- **Synced Apple Music-style lyrics** powered by `am-lyrics`.
- **Pre-bundled companion extension** loaded automatically.

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

## Running Production Build Locally
```bash
# Build app & extension
pnpm --filter @bitchord/extension build
pnpm --filter @bitchord/app build

# Run desktop directly:
pnpm --filter @bitchord/desktop start
```

## Building Windows 11 Installer & Portable Executable
```bash
pnpm --filter @bitchord/desktop build:win
```
The output files will be created in `web/desktop/dist-electron/`:
- `BitChord Setup <version>.exe` (Full NSIS Windows installer)
- `BitChord <version>.exe` (Standalone portable Windows executable)
- `win-unpacked/` (Unpacked folder ready to run `BitChord.exe` directly)


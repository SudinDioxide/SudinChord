# SudinChord

A modern, high-fidelity desktop music player for Windows built with React, TypeScript, and Electron.

## ✨ Features

- **Lossless Audio Streaming Addons:** Connect custom lossless streaming extensions and endpoints to enjoy studio-grade lossless audio.
- **Local Lossless Library:** Smooth playback with full HTTP 206 byte-range seeking support for FLAC, ALAC (Apple Lossless), WAV, AAC, and MP3.
- **Instant Folder Resuming & Artwork Caching:** Seamless folder restoration on app startup with in-memory LRU artwork caching and disk metadata caching.
- **Synchronized Lyrics:** Multi-provider lyrics integration featuring real-time word-by-word synchronization, romanization, and translation.
- **AutoMix & DJ Decks:** Dual-deck playback, intelligent track transitions, tempo alignment, and parametric equalizer.
- **Integrations:** Spotify playlist import and Discord Rich Presence listening status.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (>= 22.0.0)
- [pnpm](https://pnpm.io/) (>= 9.0.0)

### Installation

```bash
pnpm install
```

### Running in Development

Run the desktop app:

```bash
pnpm desktop
```

Or run the web client:

```bash
pnpm dev
```

### Building Windows Executable & Installer

To compile the web assets and package the Windows executable:

```bash
pnpm desktop:build
```

The packaged files will be located in `desktop/dist-electron/`:
- `SudinChord Setup 1.0.0.exe` — Windows Installer
- `win-unpacked/SudinChord.exe` — Standalone Executable

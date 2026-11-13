# SudinChord

A modern, high-fidelity desktop music player for Windows built with React, TypeScript, and Electron.

[![Release](https://img.shields.io/github/v/release/SudinDioxide/SudinChord?label=Latest%20Release&color=blue)](https://github.com/SudinDioxide/SudinChord/releases)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-lightgrey.svg)](https://github.com/SudinDioxide/SudinChord/releases)

---

## ✨ Highlights & Features

- **Lossless Audio Streaming Addons:** Connect custom streaming endpoints (e.g. PencariMovie / Tidal / Qobuz backends) to stream studio-quality lossless FLAC directly.
- **Enhanced Local Music Library (v1.1.6):**
  - **Modern Desktop UI:** Completely redesigned with Apple macOS-inspired geometry — crisp rounded rectangles (`rounded-[10px]`, `rounded-[8px]`, `rounded-[5px]`) replacing legacy pill/oval shapes.
  - **Smart Badge Formatting:** Collision-free track rows with compact high-resolution indicators (`HI-RES`, `24-BIT`) and dedicated end-padding.
  - **Albums & Artists Views:** Browse by album artwork with clean covers or by artist with modern squircle avatars.
  - **Focused Album Detail View:** Dedicated view for album tracks with streamlined playback and shuffle controls.
  - **Quick Folder Management:** One-click **Reveal** in File Explorer and instant **Rescan** for your local music folder.
  - **Format Support:** Full HTTP 206 byte-range seeking and automatic on-the-fly ALAC decoding for FLAC, ALAC, WAV, AAC, MP3, OGG, and OPUS.
- **Automatic Library Resuming & Artwork Caching:** Automatically restores your last opened music folder upon app launch with in-memory LRU artwork caching and disk metadata caching.
- **Comprehensive Playlist Management:**
  - Create and manage both **Offline Local Playlists** and **YouTube Music Cloud Playlists**.
  - **Instant 0ms Optimistic Updates**: Adding/removing tracks and creating/deleting playlists reflect immediately without UI lag.
  - Quick track removal via playlist hover trash button or context menu.
  - One-click playlist deletion with clean, modern confirmation dialogs.
- **Synced Lyrics with Romanization & Translation:** Real-time word-by-word synchronized lyrics, with integrated support for fast romanization and translation (powered by Lyrica, LRCLIB, Kugou, and YouTube Music).
- **AutoMix & DJ Deck Engine:** Dual-deck playback, automatic BPM/beat-grid matching, smooth track transitions, and parametric EQ.
- **Windows 11 Integration & Discord RPC:** Native Windows System Media Transport Controls (SMTC) flyout support, media keys, and Discord Rich Presence listening activity.

---

## 📥 Download & Setup (Pre-built Windows App)

You can download the ready-to-run Windows installer directly from GitHub Releases:

👉 **[Download SudinChord Setup 1.1.6.exe (Latest Release)](https://github.com/SudinDioxide/SudinChord/releases/download/v1.1.6/SudinChord.Setup.1.1.6.exe)**

Or view all releases and release notes at: **[GitHub Releases](https://github.com/SudinDioxide/SudinChord/releases)**

> **Note:** The compiled binaries (`.exe` installers) are hosted on GitHub Releases and excluded from the git repository source tree.

---

## 🛠️ How to Build from Source (For Developers)

### Prerequisites
- **[Node.js](https://nodejs.org/)** (v22.0.0 or higher)
- **[pnpm](https://pnpm.io/)** (v9.0.0 or higher)
- **[Git](https://git-scm.com/)**

### 1. Clone the Repository
```bash
git clone https://github.com/SudinDioxide/SudinChord.git
cd SudinChord
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Run in Development Mode
To launch the desktop Electron app in development mode with hot-reloading:
```bash
pnpm desktop
```

Or to run the web interface in your browser:
```bash
pnpm dev
```

### 4. Build Windows Executable & Installer
To compile production assets and package the Windows desktop installer:
```bash
pnpm desktop:build
```

The output files will be created in `desktop/dist-electron/`:
- `SudinChord-Setup-1.1.6.exe` (Windows NSIS Installer)
- `win-unpacked/SudinChord.exe` (Portable Windows Application)

---

## ⚙️ Configuration & Features Guide

### 1. Adding Lossless Streaming Addons
SudinChord supports connecting custom lossless streaming endpoints:
1. Open **Settings** from the sidebar.
2. Select **Lossless Addons** (or navigate to `/settings/addons`).
3. You can install all community addons with one click using the **Install All** button, or add individual addons:
   - **PencariMusic:** `https://stream.pencarimovie.com/66ff097863dedb7ccd8401d5ffe616f3/music` (Universal Lossless / Telegram)
   - **prodpwh addon:** `https://addon.palv.org` (Dolby Atmos & 24-bit/192kHz Hi-Res FLAC Gateway)
   - **Confih Hi-Res:** `https://bitchord.confih.tech` (Multi-source Lossless & Dolby Atmos)
   - **Qobuz [Heisenberg]:** `https://heisenbergbackaaahh.de.deplexo.com/a/manifest.json` (Bit-perfect Qobuz Hi-Res)
   - **juanjob hi res:** `https://bitchord-hires-addon.de.deplexo.com/` (Multi-source Qobuz/Tidal)
4. You can reorder enabled addons by priority; SudinChord automatically routes playback through the highest quality active provider.

### 2. Playing Local Music
1. Click **Local Files** in the sidebar.
2. Click **Open Music Folder** and select your local music directory (e.g. `Music/Tamil` or `Music/Hi-Res`).
3. **Supported Formats:**
   - `.flac` (16-bit and 24-bit high-resolution FLAC)
   - `.m4a` / `.alac` (Apple Lossless Audio Codec and AAC)
   - `.wav`, `.mp3`, `.ogg`, `.opus`, `.webm`
4. **Auto-Save:** SudinChord automatically remembers your last opened music folder and restores all tracks and album artwork whenever you reopen the app.

### 3. Managing Playlists
- **Creating a Playlist**: Click **+** or **New Playlist** in the sidebar. Choose either **Local Playlist** (saved offline on your computer) or **YouTube Music** (saved to your Google/YouTube account).
- **Adding Songs**: Click the three dots `•••` on any track and select **Add to Playlist**.
- **Removing Songs**: Hover over any track in a playlist and click the trash can icon, or select **Remove from Playlist** from the track's context menu.
- **Deleting a Playlist**: Navigate to the playlist page and click **Delete Playlist**.

### 4. Setting Up Lyrics (Romanization & Translation)
1. Open **Settings** › **Lyrics**.
2. **Lyric Providers:** Enable sources like Lyrica, LRCLIB, Kugou, Musixmatch, or YouTube Music.
3. **Romanization & Translation:**
   - Toggle **Romanize Lyrics** to view phonetic transcriptions for non-Latin scripts (Tamil, Japanese, Korean, Chinese, Hindi, etc.).
   - Toggle **Translate Lyrics** to view English translations line-by-line.
4. **Fast Lyrica Server (Optional Local Acceleration):**
   - SudinChord automatically checks for a local [Lyrica](https://github.com/Wilooper/Lyrica) instance running on `http://127.0.0.1:9999/`.
   - Running a local Lyrica server speeds up lyric fetching from ~15 seconds to under 30 milliseconds.

---

## 📁 Project Structure

```
SudinChord/
├── app/                  # React + Vite frontend application
│   ├── src/
│   │   ├── components/   # UI components (TrackList, TrackMenu, Modals, etc.)
│   │   ├── data/         # Data layer & queries (YouTube, Local Playlists, Cache)
│   │   ├── playback/     # Audio engines, local playback, AutoMix, Addon resolver
│   │   ├── lyrics/       # Synced lyrics providers (Lyrica, LRCLIB, Kugou)
│   │   ├── pages/        # UI Views (Home, Local Files, Playlist, Addons, Settings)
│   │   └── shell/        # Player bar, fullscreen view, navigation sidebar
├── desktop/              # Electron desktop backend
│   ├── main.cjs          # Local HTTP streaming server with HTTP 206 Byte-Range & ALAC transcoding
│   ├── localMetadata.cjs # Zero-dependency metadata & album artwork parser
│   └── bin/              # Bundled static FFmpeg for lossless audio processing
├── shared/               # Shared TypeScript types and protocols
└── extension/            # Background extension bridge
```

---

## 📄 License
This project is licensed under the [GNU General Public License v3.0](LICENSE).

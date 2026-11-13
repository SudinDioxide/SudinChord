import type { Track } from '@/data/music/types';
import { parseAudioBufferMetadata, parseAudioFileMetadata, parseFileName, type ParsedMetadata } from './id3';

export interface LocalMediaItem {
  id: string;
  videoId: string;
  url: string;
  file?: File;
  filePath?: string;
  lyrics?: string;
  track: Track;
}

export interface ScannedTrackItem {
  filePath: string;
  title: string;
  artist: string;
  album?: string | null;
  durationSec?: number | null;
  hasArtwork?: boolean;
  formatInfo?: {
    codec: string;
    bitDepth?: number;
    sampleRate?: number;
    isHiRes?: boolean;
  } | null;
  fileSize?: number;
}

const FOLDER_STORAGE_KEY = 'sudinchord_local_music_folder';

export function getSavedMusicFolder(): string | null {
  try {
    return localStorage.getItem(FOLDER_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function inferFormatInfo(filePath: string, formatInfo?: ScannedTrackItem['formatInfo']): NonNullable<ScannedTrackItem['formatInfo']> {
  if (formatInfo && formatInfo.codec) return formatInfo;
  const ext = (filePath.split('.').pop() || '').toLowerCase();
  if (ext === 'flac') {
    return { codec: 'flac', isHiRes: false, bitDepth: 16, sampleRate: 44100 };
  }
  if (ext === 'wav') {
    return { codec: 'wav', isHiRes: false, bitDepth: 16, sampleRate: 44100 };
  }
  if (ext === 'm4a' || ext === 'aac') {
    return { codec: 'm4a', isHiRes: false };
  }
  if (ext === 'alac') {
    return { codec: 'alac', isHiRes: false, bitDepth: 16, sampleRate: 44100 };
  }
  if (ext === 'ogg' || ext === 'opus') {
    return { codec: 'ogg', isHiRes: false };
  }
  if (ext === 'mp3') {
    return { codec: 'mp3', isHiRes: false };
  }
  return { codec: ext || 'audio', isHiRes: false };
}

function getLocalMediaOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin?.startsWith('http')) {
    return window.location.origin;
  }
  return 'http://localhost:5173';
}

function makeTrackId(filePath: string): string {
  let hash = 0;
  for (let i = 0; i < filePath.length; i++) {
    hash = (hash << 5) - hash + filePath.charCodeAt(i);
    hash |= 0;
  }
  const cleanName = (filePath.split(/[/\\]/).pop() || 'track')
    .replace(/\.[a-zA-Z0-9]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${Math.abs(hash).toString(36)}_${cleanName}`;
}

export function setSavedMusicFolder(folder: string | null) {
  try {
    if (folder) {
      localStorage.setItem(FOLDER_STORAGE_KEY, folder);
    } else {
      localStorage.removeItem(FOLDER_STORAGE_KEY);
    }
  } catch {}
}

class LocalTracksManager {
  private items = new Map<string, LocalMediaItem>();
  private listeners = new Set<() => void>();
  private cachedTracks: Track[] = [];
  private currentFolder: string | null = null;
  private initialized = false;

  constructor() {
    this.currentFolder = getSavedMusicFolder();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify() {
    this.cachedTracks = Array.from(this.items.values()).map((item) => item.track);
    this.listeners.forEach((l) => l());
  }

  getTracks = (): Track[] => {
    return this.cachedTracks;
  };

  getCurrentFolder(): string | null {
    return this.currentFolder || getSavedMusicFolder();
  }

  setCurrentFolder(folder: string | null) {
    this.currentFolder = folder;
    setSavedMusicFolder(folder);
    this.notify();
  }

  getMedia(videoId: string): LocalMediaItem | null {
    const direct = this.items.get(videoId);
    if (direct) return direct;
    for (const item of this.items.values()) {
      if (item.videoId === videoId || item.id === videoId) return item;
    }
    if (videoId.startsWith('local:')) {
      const rest = videoId.slice(6);
      for (const item of this.items.values()) {
        if (item.filePath && (item.filePath.includes(rest) || rest.includes(item.id))) {
          return item;
        }
      }
    }
    return null;
  }

  async init(): Promise<void> {
    if (this.initialized && this.items.size > 0) return;
    const ok = await this.loadSavedFolder();
    if (ok) this.initialized = true;
  }

  async loadSavedFolder(): Promise<boolean> {
    const folder = getSavedMusicFolder();
    if (!folder) return false;

    const ep = (
      window as unknown as {
        electronPlatform?: {
          scanLocalFolder?: (dir: string) => Promise<{ folderPath: string; tracks: ScannedTrackItem[] } | null>;
        };
      }
    ).electronPlatform;

    if (ep?.scanLocalFolder) {
      try {
        const res = await ep.scanLocalFolder(folder);
        if (res && res.tracks && res.tracks.length) {
          this.currentFolder = res.folderPath || folder;
          this.clear();
          this.addScannedTracks(res.tracks);
          return true;
        }
      } catch {}
    }
    return false;
  }

  addScannedTracks(scanned: ScannedTrackItem[]): Track[] {
    const origin = getLocalMediaOrigin();
    const newTracks: Track[] = [];
    for (const item of scanned) {
      const id = makeTrackId(item.filePath);
      const videoId = `local:${id}`;
      const url = `${origin}/local-file?path=${encodeURIComponent(item.filePath)}`;
      const thumbnail = item.hasArtwork ? `${url}&art=1` : null;

      const resolvedFormat = inferFormatInfo(item.filePath, item.formatInfo);

      const track: Track = {
        videoId,
        title: item.title,
        artists: [{ name: item.artist, id: null }],
        album: item.album ? { name: item.album, id: null } : null,
        durationSec: item.durationSec || null,
        explicit: false,
        thumbnail,
        index: this.items.size + 1,
        plays: null,
        filePath: item.filePath,
        fileSize: item.fileSize,
        formatInfo: resolvedFormat,
      };

      this.items.set(videoId, {
        id,
        videoId,
        url,
        filePath: item.filePath,
        track,
      });

      newTracks.push(track);
    }

    if (newTracks.length) {
      this.notify();
    }
    return newTracks;
  }

  async addFiles(files: File[]): Promise<Track[]> {
    const audioFiles = files.filter((f) => {
      const name = f.name.toLowerCase();
      return (
        f.type.startsWith('audio/') ||
        name.endsWith('.mp3') ||
        name.endsWith('.flac') ||
        name.endsWith('.wav') ||
        name.endsWith('.m4a') ||
        name.endsWith('.aac') ||
        name.endsWith('.ogg') ||
        name.endsWith('.opus') ||
        name.endsWith('.webm')
      );
    });

    const newTracks: Track[] = [];

    const isElectron =
      typeof window !== 'undefined' &&
      !!(window as unknown as { electronPlatform?: { isElectron?: boolean; getPathForFile?: (f: File) => string | null } })
        .electronPlatform?.isElectron;

    for (const file of audioFiles) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const videoId = `local:${id}`;

      const ep = (window as unknown as { electronPlatform?: { getPathForFile?: (f: File) => string | null } }).electronPlatform;
      const nativePath = ep?.getPathForFile?.(file) || (file as unknown as { path?: string }).path || null;
      const origin = getLocalMediaOrigin();
      const url =
        isElectron && nativePath
          ? `${origin}/local-file?path=${encodeURIComponent(nativePath)}`
          : URL.createObjectURL(file);

      const meta = await parseAudioFileMetadata(file);
      const durationSec = await getAudioDuration(url);

      const track: Track = {
        videoId,
        title: meta.title,
        artists: [{ name: meta.artist, id: null }],
        album: meta.album ? { name: meta.album, id: null } : null,
        durationSec,
        explicit: false,
        thumbnail: meta.artworkBlobUrl,
        index: this.items.size + 1,
        plays: null,
        filePath: nativePath || undefined,
        fileSize: file.size,
        formatInfo: inferFormatInfo(nativePath || file.name),
      };

      this.items.set(videoId, {
        id,
        videoId,
        url,
        file,
        filePath: nativePath || undefined,
        lyrics: meta.lyrics || undefined,
        track,
      });

      newTracks.push(track);
    }

    if (newTracks.length) {
      this.notify();
    }
    return newTracks;
  }

  async addPaths(paths: string[]): Promise<Track[]> {
    const audioExts = ['.mp3', '.flac', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.webm'];
    const validPaths = paths.filter((p) => audioExts.some((ext) => p.toLowerCase().endsWith(ext)));

    const isElectron =
      typeof window !== 'undefined' &&
      !!(
        window as unknown as {
          electronPlatform?: {
            isElectron?: boolean;
            parseLocalFiles?: (paths: string[]) => Promise<ScannedTrackItem[]>;
            getFolderArt?: (dir: string) => Promise<string | null>;
          };
        }
      ).electronPlatform?.isElectron;

    // Use fast native scanner in Electron
    if (isElectron) {
      const ep = (
        window as unknown as {
          electronPlatform?: { parseLocalFiles?: (paths: string[]) => Promise<ScannedTrackItem[]> };
        }
      ).electronPlatform;
      if (ep?.parseLocalFiles) {
        try {
          const parsed = await ep.parseLocalFiles(validPaths);
          if (parsed && parsed.length) {
            return this.addScannedTracks(parsed);
          }
        } catch {}
      }
    }

    const newTracks: Track[] = [];
    const folderArtCache = new Map<string, string | null>();

    for (const filePath of validPaths) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const videoId = `local:${id}`;
      const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
      const url = isElectron
        ? `local-audio://stream?path=${encodeURIComponent(filePath)}`
        : `${origin}/local-file?path=${encodeURIComponent(filePath)}`;

      const fileName = filePath.split(/[/\\]/).pop() || 'Local Audio';
      const fnMeta = parseFileName(fileName);
      let meta: ParsedMetadata = {
        title: fnMeta.title,
        artist: fnMeta.artist,
        album: null,
        trackNumber: null,
        artworkBlobUrl: null,
        lyrics: null,
      };

      try {
        const res = await fetch(url, { headers: { Range: 'bytes=0-16777215' } }).catch(() => null);
        if (res && (res.ok || res.status === 206)) {
          const buf = await res.arrayBuffer();
          meta = parseAudioBufferMetadata(buf, fileName);
        }
      } catch {}



      const durationSec = await getAudioDuration(url);

      const track: Track = {
        videoId,
        title: meta.title,
        artists: [{ name: meta.artist, id: null }],
        album: meta.album ? { name: meta.album, id: null } : null,
        durationSec,
        explicit: false,
        thumbnail: meta.artworkBlobUrl,
        index: this.items.size + 1,
        plays: null,
        filePath,
        formatInfo: inferFormatInfo(filePath),
      };

      this.items.set(videoId, {
        id,
        videoId,
        url,
        filePath,
        lyrics: meta.lyrics || undefined,
        track,
      });

      newTracks.push(track);
    }

    if (newTracks.length) {
      this.notify();
    }
    return newTracks;
  }

  removeTrack(videoId: string) {
    const item = this.items.get(videoId);
    if (item) {
      if (item.url.startsWith('blob:')) {
        URL.revokeObjectURL(item.url);
      }
      if (item.track.thumbnail?.startsWith('blob:')) {
        URL.revokeObjectURL(item.track.thumbnail);
      }
      this.items.delete(videoId);
      this.notify();
    }
  }

  clear() {
    for (const item of this.items.values()) {
      if (item.url.startsWith('blob:')) {
        URL.revokeObjectURL(item.url);
      }
      if (item.track.thumbnail?.startsWith('blob:')) {
        URL.revokeObjectURL(item.track.thumbnail);
      }
    }
    this.items.clear();
    this.notify();
  }
}

export const localTracksManager = new LocalTracksManager();

function getAudioDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    const timer = setTimeout(() => {
      audio.src = '';
      resolve(null);
    }, 1000);

    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      const sec = Math.round(audio.duration);
      audio.src = '';
      resolve(Number.isFinite(sec) && sec > 0 ? sec : null);
    };

    audio.onerror = () => {
      clearTimeout(timer);
      audio.src = '';
      resolve(null);
    };

    audio.src = url;
  });
}

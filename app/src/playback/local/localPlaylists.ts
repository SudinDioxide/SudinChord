import { useSyncExternalStore } from 'react';
import type { Track } from '@/data/music/types';

export interface LocalPlaylist {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  tracks: Track[];
  thumbnail: string | null;
}

const STORAGE_KEY = 'sudinchord_local_playlists';

class LocalPlaylistStore {
  private playlists: LocalPlaylist[] = [];
  private listeners = new Set<() => void>();

  constructor() {
    this.playlists = this.readStorage();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === STORAGE_KEY) {
          this.playlists = this.readStorage();
          this.notify();
        }
      });
    }
  }

  private readStorage(): LocalPlaylist[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[LocalPlaylists] Failed to read playlists from localStorage', e);
      return [];
    }
  }

  private writeStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.playlists));
    } catch (e) {
      console.error('[LocalPlaylists] Failed to persist playlists to localStorage', e);
    }
    this.notify();
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): LocalPlaylist[] => {
    return this.playlists;
  };

  getAll(): LocalPlaylist[] {
    return this.playlists;
  }

  get(id: string): LocalPlaylist | undefined {
    return this.playlists.find((p) => p.id === id);
  }

  create(name: string, description = '', initialTracks: Track[] = []): LocalPlaylist {
    const trimmed = name.trim() || 'Untitled Playlist';
    const firstArt = initialTracks.find((t) => t.thumbnail)?.thumbnail ?? null;
    const playlist: LocalPlaylist = {
      id: `local_pl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: trimmed,
      description: description.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tracks: [...initialTracks],
      thumbnail: firstArt,
    };
    this.playlists = [playlist, ...this.playlists];
    this.writeStorage();
    return playlist;
  }

  delete(id: string): void {
    this.playlists = this.playlists.filter((p) => p.id !== id);
    this.writeStorage();
  }

  rename(id: string, name: string, description?: string): void {
    const pl = this.playlists.find((p) => p.id === id);
    if (!pl) return;
    pl.name = name.trim() || pl.name;
    if (description !== undefined) {
      pl.description = description.trim();
    }
    pl.updatedAt = Date.now();
    this.playlists = [...this.playlists];
    this.writeStorage();
  }

  addTracks(id: string, newTracks: Track[]): void {
    const pl = this.playlists.find((p) => p.id === id);
    if (!pl || newTracks.length === 0) return;
    
    // Append tracks
    pl.tracks = [...pl.tracks, ...newTracks];
    if (!pl.thumbnail) {
      pl.thumbnail = pl.tracks.find((t) => t.thumbnail)?.thumbnail ?? null;
    }
    pl.updatedAt = Date.now();
    this.playlists = [...this.playlists];
    this.writeStorage();
  }

  removeTrack(id: string, index: number): void {
    const pl = this.playlists.find((p) => p.id === id);
    if (!pl || index < 0 || index >= pl.tracks.length) return;

    pl.tracks = pl.tracks.filter((_, i) => i !== index);
    pl.thumbnail = pl.tracks.find((t) => t.thumbnail)?.thumbnail ?? null;
    pl.updatedAt = Date.now();
    this.playlists = [...this.playlists];
    this.writeStorage();
  }

  reorder(id: string, fromIndex: number, toIndex: number): void {
    const pl = this.playlists.find((p) => p.id === id);
    if (!pl || fromIndex === toIndex) return;
    if (fromIndex < 0 || fromIndex >= pl.tracks.length || toIndex < 0 || toIndex >= pl.tracks.length) return;

    const list = [...pl.tracks];
    const [moved] = list.splice(fromIndex, 1);
    if (!moved) return;
    list.splice(toIndex, 0, moved);

    pl.tracks = list;
    pl.thumbnail = pl.tracks.find((t) => t.thumbnail)?.thumbnail ?? null;
    pl.updatedAt = Date.now();
    this.playlists = [...this.playlists];
    this.writeStorage();
  }
}

export const localPlaylists = new LocalPlaylistStore();

export function useLocalPlaylists(): LocalPlaylist[] {
  return useSyncExternalStore(localPlaylists.subscribe, localPlaylists.getSnapshot);
}

export function useLocalPlaylist(id: string): LocalPlaylist | undefined {
  const all = useLocalPlaylists();
  return all.find((p) => p.id === id);
}


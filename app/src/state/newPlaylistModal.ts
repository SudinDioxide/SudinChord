import { create } from 'zustand';
import type { Track } from '@/data/music/types';

export type PlaylistPlatform = 'local' | 'youtube';

interface NewPlaylistModalState {
  isOpen: boolean;
  initialTrack: Track | null;
  defaultPlatform: PlaylistPlatform;
  open: (options?: { initialTrack?: Track | null; defaultPlatform?: PlaylistPlatform }) => void;
  close: () => void;
}

export const useNewPlaylistModal = create<NewPlaylistModalState>((set) => ({
  isOpen: false,
  initialTrack: null,
  defaultPlatform: 'local',
  open: (opts) =>
    set({
      isOpen: true,
      initialTrack: opts?.initialTrack ?? null,
      defaultPlatform: opts?.defaultPlatform ?? 'local',
    }),
  close: () => set({ isOpen: false, initialTrack: null }),
}));


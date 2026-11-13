import type { ScannedTrackItem } from '@/playback/local/localTracks';

export interface ElectronPlatform {
  isElectron?: boolean;
  isWindows?: boolean;
  openLocalFiles?: () => Promise<string[]>;
  openLocalFolder?: () => Promise<{ folderPath: string; tracks: ScannedTrackItem[] } | null>;
  scanLocalFolder?: (dir: string) => Promise<{ folderPath: string; tracks: ScannedTrackItem[] } | null>;
  parseLocalFiles?: (paths: string[]) => Promise<ScannedTrackItem[]>;
  getFolderArt?: (dir: string) => Promise<string | null>;
  revealLocalFile?: (filePath: string) => Promise<boolean>;
  revealLocalFolder?: (folderPath: string) => Promise<boolean>;
  getPathForFile?: (file: File) => string | null;
  toggleMiniPlayer?: (opts?: { minimizeMain?: boolean }) => void;
  sendMediaState?: (state: unknown) => void;
  sendLyrics?: (lyrics: unknown) => void;
  installUpdate?: () => void;
  checkForUpdates?: () => void;
}

export function getElectronPlatform(): ElectronPlatform | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { electronPlatform?: ElectronPlatform }).electronPlatform;
}


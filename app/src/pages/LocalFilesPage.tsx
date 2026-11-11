import { Music2, FolderPlus, FileAudio, Play, Shuffle, Trash2, Folder, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { playList, shuffleList } from '@/components/music/play';
import { TrackList } from '@/components/music/TrackList';
import { formatDuration } from '@/components/music/links';
import { localTracksManager, type ScannedTrackItem } from '@/playback/local/localTracks';
import { usePageTint } from '@/lib/usePageTint';

interface ElectronPlatform {
  openLocalFiles?: () => Promise<string[]>;
  openLocalFolder?: () => Promise<{ folderPath: string; tracks: ScannedTrackItem[] } | null>;
  scanLocalFolder?: (dir: string) => Promise<{ folderPath: string; tracks: ScannedTrackItem[] } | null>;
  parseLocalFiles?: (paths: string[]) => Promise<ScannedTrackItem[]>;
  getFolderArt?: (dir: string) => Promise<string | null>;
}

declare global {
  interface Window {
    electronPlatform?: ElectronPlatform;
  }
}

const LOCAL_CONTEXT = { source: { title: 'Local Files', type: 'playlist' as const, id: 'local-files' } };

export default function LocalFilesPage() {
  const tracks = useSyncExternalStore(localTracksManager.subscribe, localTracksManager.getTracks);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);

  usePageTint(null);

  // Auto-load saved folder on mount
  useEffect(() => {
    if (tracks.length === 0) {
      void localTracksManager.init();
    }
  }, [tracks.length]);

  const currentFolder = localTracksManager.getCurrentFolder();

  const handleOpenFiles = useCallback(async () => {
    if (window.electronPlatform?.openLocalFiles) {
      const paths = await window.electronPlatform.openLocalFiles();
      if (paths && paths.length) {
        setIsScanning(true);
        if (window.electronPlatform.parseLocalFiles) {
          const parsed = await window.electronPlatform.parseLocalFiles(paths);
          localTracksManager.addScannedTracks(parsed);
        } else {
          await localTracksManager.addPaths(paths);
        }
        setIsScanning(false);
      }
    } else {
      fileInputRef.current?.click();
    }
  }, []);

  const handleOpenFolder = useCallback(async () => {
    if (window.electronPlatform?.openLocalFolder) {
      setIsScanning(true);
      const res = await window.electronPlatform.openLocalFolder();
      if (res && res.tracks && res.tracks.length) {
        localTracksManager.clear();
        localTracksManager.setCurrentFolder(res.folderPath);
        localTracksManager.addScannedTracks(res.tracks);
      }
      setIsScanning(false);
    } else {
      folderInputRef.current?.click();
    }
  }, []);

  const handleRescan = useCallback(async () => {
    const folder = localTracksManager.getCurrentFolder();
    if (folder && window.electronPlatform?.scanLocalFolder) {
      setIsScanning(true);
      const res = await window.electronPlatform.scanLocalFolder(folder);
      if (res && res.tracks && res.tracks.length) {
        localTracksManager.clear();
        localTracksManager.addScannedTracks(res.tracks);
      }
      setIsScanning(false);
    }
  }, []);

  const onFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length) {
      setIsScanning(true);
      await localTracksManager.addFiles(Array.from(files));
      setIsScanning(false);
      e.target.value = '';
    }
  }, []);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = Array.from(e.dataTransfer.files);
    if (files.length) {
      setIsScanning(true);
      await localTracksManager.addFiles(files);
      setIsScanning(false);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const totalSec = tracks.reduce((acc, t) => acc + (t.durationSec || 0), 0);
  const metaText = `${tracks.length} ${tracks.length === 1 ? 'song' : 'songs'}${totalSec > 0 ? ` · ${formatDuration(totalSec)}` : ''}`;

  return (
    <div className="mx-(--body-gutter) pt-4" onDrop={onDrop} onDragOver={onDragOver}>
      {/* Hidden file inputs for web/fallback mode */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="audio/*,.mp3,.flac,.wav,.m4a,.aac,.ogg,.opus,.webm"
        className="hidden"
        onChange={onFileInputChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        // @ts-expect-error webkitdirectory is standard in browsers
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
        onChange={onFileInputChange}
      />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <PageHeader title="Local Files" />
          <p className="mt-1 type-callout text-secondary">{metaText}</p>
          {currentFolder && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-secondary bg-quaternary/40 px-2.5 py-1 rounded-[8px] max-w-xl">
              <Folder size={13} className="text-key flex-none" />
              <span className="truncate flex-1" title={currentFolder}>
                {currentFolder}
              </span>
              <button
                onClick={handleRescan}
                disabled={isScanning}
                className="inline-flex items-center gap-1 text-key hover:underline font-medium ml-2 flex-none"
                title="Rescan this folder"
              >
                <RefreshCw size={11} className={isScanning ? 'animate-spin' : ''} />
                <span>Rescan</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleOpenFiles}
            disabled={isScanning}
            className="inline-flex h-9 items-center gap-1.5 rounded-[20px] bg-quinary px-3.5 type-callout-emphasized text-primary hover:bg-quaternary transition-colors disabled:opacity-50"
          >
            <FileAudio size={16} />
            <span>Open Files</span>
          </button>

          <button
            onClick={handleOpenFolder}
            disabled={isScanning}
            className="inline-flex h-9 items-center gap-1.5 rounded-[20px] bg-quinary px-3.5 type-callout-emphasized text-primary hover:bg-quaternary transition-colors disabled:opacity-50"
          >
            <FolderPlus size={16} />
            <span>{currentFolder ? 'Change Folder' : 'Open Folder'}</span>
          </button>

          {tracks.length > 0 && (
            <>
              <button
                onClick={() => playList(tracks, 0, LOCAL_CONTEXT)}
                className="inline-flex h-9 items-center gap-1.5 rounded-[20px] bg-key px-4 type-callout-emphasized text-white hover:brightness-110 transition-all"
              >
                <Play size={16} fill="currentColor" />
                <span>Play All</span>
              </button>

              <button
                onClick={() => shuffleList(tracks, LOCAL_CONTEXT)}
                className="grid size-9 place-items-center rounded-full bg-quinary text-primary hover:bg-quaternary transition-colors"
                title="Shuffle"
              >
                <Shuffle size={17} />
              </button>

              <button
                onClick={() => {
                  localTracksManager.clear();
                  localTracksManager.setCurrentFolder(null);
                }}
                className="grid size-9 place-items-center rounded-full bg-quinary text-secondary hover:text-red-400 hover:bg-quaternary transition-colors"
                title="Clear List"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      {isScanning && (
        <div className="mb-4 flex items-center gap-2 p-3 rounded-[10px] bg-quinary text-secondary text-sm">
          <RefreshCw size={15} className="animate-spin text-key" />
          <span>Scanning local audio library and reading album covers…</span>
        </div>
      )}

      {tracks.length === 0 && !isScanning ? (
        <div
          onClick={handleOpenFolder}
          className="mt-8 flex flex-col items-center justify-center rounded-[18px] border-2 border-dashed border-quaternary bg-quinary/30 p-12 text-center cursor-pointer hover:border-key/60 hover:bg-quinary/50 transition-all"
        >
          <div className="mb-4 grid size-16 place-items-center rounded-full bg-quinary text-key">
            <Music2 size={32} />
          </div>
          <h2 className="type-title-3-emphasized text-primary">No local music loaded</h2>
          <p className="mt-1 max-w-sm type-body text-secondary">
            Choose your music folder once. SudinChord will remember it and automatically load your tracks every time you launch the app.
          </p>
          <button className="mt-5 inline-flex h-10 items-center gap-2 rounded-[20px] bg-key px-5 type-callout-emphasized text-white hover:brightness-110 transition-all">
            <FolderPlus size={18} />
            <span>Choose Music Folder</span>
          </button>
        </div>
      ) : (
        <TrackList tracks={tracks} variant="playlist" source={LOCAL_CONTEXT.source} />
      )}
    </div>
  );
}

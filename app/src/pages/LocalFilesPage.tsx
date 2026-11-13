import {
  FolderPlus,
  FileAudio,
  Play,
  Shuffle,
  Trash2,
  Folder,
  FolderOpen,
  RefreshCw,
  Search,
  X,
  ArrowUpDown,
  List,
  Users,
  Disc3,
  ChevronLeft,
  Sparkles,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { playList, shuffleList } from '@/components/music/play';
import { TrackList } from '@/components/music/TrackList';
import { formatDuration } from '@/components/music/links';
import { localTracksManager, inferFormatInfo } from '@/playback/local/localTracks';
import { usePageTint } from '@/lib/usePageTint';
import { getElectronPlatform } from '@/lib/electronPlatform';
import type { Track } from '@/data/music/types';

const LOCAL_CONTEXT = { source: { title: 'Local Files', type: 'playlist' as const, id: 'local-files' } };

type ViewMode = 'songs' | 'albums' | 'artists';
type SortOption = 'default' | 'title-asc' | 'title-desc' | 'artist-asc' | 'album-asc' | 'duration-desc' | 'duration-asc' | 'quality';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

interface AlbumGroup {
  id: string;
  name: string;
  artist: string;
  artworkUri?: string;
  tracks: Track[];
  isHiRes: boolean;
}

interface ArtistGroup {
  name: string;
  tracks: Track[];
  albumCount: number;
  artworkUri?: string;
}

export default function LocalFilesPage() {
  const tracks = useSyncExternalStore(localTracksManager.subscribe, localTracksManager.getTracks);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [isScanning, setIsScanning] = useState(false);

  // UX Controls
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('songs');
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [selectedArtistName, setSelectedArtistName] = useState<string | null>(null);

  usePageTint(null);

  // Auto-load saved folder on mount
  useEffect(() => {
    if (tracks.length === 0) {
      void localTracksManager.init();
    }
  }, [tracks.length]);

  const currentFolder = localTracksManager.getCurrentFolder();
  const ep = getElectronPlatform();

  const handleOpenFiles = useCallback(async () => {
    if (ep?.openLocalFiles) {
      const paths = await ep.openLocalFiles();
      if (paths && paths.length) {
        setIsScanning(true);
        if (ep.parseLocalFiles) {
          const parsed = await ep.parseLocalFiles(paths);
          localTracksManager.addScannedTracks(parsed);
        } else {
          await localTracksManager.addPaths(paths);
        }
        setIsScanning(false);
      }
    } else {
      fileInputRef.current?.click();
    }
  }, [ep]);

  const handleOpenFolder = useCallback(async () => {
    if (ep?.openLocalFolder) {
      setIsScanning(true);
      const res = await ep.openLocalFolder();
      if (res && res.tracks && res.tracks.length) {
        localTracksManager.clear();
        localTracksManager.setCurrentFolder(res.folderPath);
        localTracksManager.addScannedTracks(res.tracks);
      }
      setIsScanning(false);
    } else {
      folderInputRef.current?.click();
    }
  }, [ep]);

  const handleRescan = useCallback(async () => {
    const folder = localTracksManager.getCurrentFolder();
    if (folder && ep?.scanLocalFolder) {
      setIsScanning(true);
      const res = await ep.scanLocalFolder(folder);
      if (res && res.tracks && res.tracks.length) {
        localTracksManager.clear();
        localTracksManager.addScannedTracks(res.tracks);
      }
      setIsScanning(false);
    }
  }, [ep]);

  const handleRevealFolder = useCallback(() => {
    if (currentFolder && ep?.revealLocalFolder) {
      void ep.revealLocalFolder(currentFolder);
    }
  }, [currentFolder, ep]);

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

  // Stats Breakdown
  const { totalSec, totalBytes, hiResCount } = useMemo(() => {
    let sec = 0;
    let bytes = 0;
    let hiRes = 0;

    for (const t of tracks) {
      sec += t.durationSec || 0;
      bytes += t.fileSize || 0;
      const fi = t.formatInfo || (t.filePath || t.videoId?.startsWith('local:') ? inferFormatInfo(t.filePath || t.videoId.slice(6)) : null);
      const isHi = fi?.isHiRes || (fi?.sampleRate && fi.sampleRate > 48000);
      if (isHi) {
        hiRes++;
      }
    }
    return {
      totalSec: sec,
      totalBytes: bytes,
      hiResCount: hiRes,
    };
  }, [tracks]);

  // Grouped Albums
  const albums = useMemo<AlbumGroup[]>(() => {
    const map = new Map<string, AlbumGroup>();
    for (const t of tracks) {
      const albumName = t.album?.name?.trim() || 'Unknown Album';
      const artistName = t.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';
      const key = `${albumName.toLowerCase()}:::${(t.artists?.[0]?.name || '').toLowerCase()}`;
      let group = map.get(key);
      const fi = t.formatInfo || (t.filePath || t.videoId?.startsWith('local:') ? inferFormatInfo(t.filePath || t.videoId.slice(6)) : null);
      const isHi = fi?.isHiRes || (fi?.sampleRate && fi.sampleRate > 48000);

      if (!group) {
        group = {
          id: key,
          name: albumName,
          artist: artistName,
          artworkUri: t.thumbnail || undefined,
          tracks: [],
          isHiRes: false,
        };
        map.set(key, group);
      }
      if (!group.artworkUri && t.thumbnail) {
        group.artworkUri = t.thumbnail;
      }
      if (isHi) {
        group.isHiRes = true;
      }
      group.tracks.push(t);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tracks]);

  // Grouped Artists
  const artists = useMemo<ArtistGroup[]>(() => {
    const map = new Map<string, { tracks: Track[]; albums: Set<string>; artworkUri?: string }>();
    for (const t of tracks) {
      const artistName = t.artists?.[0]?.name?.trim() || 'Unknown Artist';
      let existing = map.get(artistName);
      if (!existing) {
        existing = { tracks: [], albums: new Set<string>(), artworkUri: t.thumbnail || undefined };
        map.set(artistName, existing);
      }
      existing.tracks.push(t);
      if (t.album?.name) existing.albums.add(t.album.name);
      if (!existing.artworkUri && t.thumbnail) existing.artworkUri = t.thumbnail;
    }
    return Array.from(map.entries())
      .map(([name, data]) => ({
        name,
        tracks: data.tracks,
        albumCount: data.albums.size,
        artworkUri: data.artworkUri,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tracks]);

  // Filter & Sort tracks
  const filteredTracks = useMemo(() => {
    let result = tracks;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((t) => {
        const titleMatch = t.title?.toLowerCase().includes(q);
        const artistMatch = t.artists?.some((a) => a.name.toLowerCase().includes(q));
        const albumMatch = t.album?.name?.toLowerCase().includes(q);
        const fi = t.formatInfo || (t.filePath || t.videoId?.startsWith('local:') ? inferFormatInfo(t.filePath || t.videoId.slice(6)) : null);
        const codecMatch = fi?.codec?.toLowerCase().includes(q);
        return titleMatch || artistMatch || albumMatch || codecMatch;
      });
    }

    if (sortBy === 'title-asc') {
      result = [...result].sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (sortBy === 'title-desc') {
      result = [...result].sort((a, b) => (b.title || '').localeCompare(a.title || ''));
    } else if (sortBy === 'artist-asc') {
      result = [...result].sort((a, b) => (a.artists?.[0]?.name || '').localeCompare(b.artists?.[0]?.name || ''));
    } else if (sortBy === 'album-asc') {
      result = [...result].sort((a, b) => (a.album?.name || '').localeCompare(b.album?.name || ''));
    } else if (sortBy === 'duration-desc') {
      result = [...result].sort((a, b) => (b.durationSec || 0) - (a.durationSec || 0));
    } else if (sortBy === 'duration-asc') {
      result = [...result].sort((a, b) => (a.durationSec || 0) - (b.durationSec || 0));
    } else if (sortBy === 'quality') {
      result = [...result].sort((a, b) => {
        const aFi = a.formatInfo || (a.filePath || a.videoId?.startsWith('local:') ? inferFormatInfo(a.filePath || a.videoId.slice(6)) : null);
        const bFi = b.formatInfo || (b.filePath || b.videoId?.startsWith('local:') ? inferFormatInfo(b.filePath || b.videoId.slice(6)) : null);
        const aScore = (aFi?.isHiRes ? 2000 : 0) + (aFi?.bitDepth || 16) * 10 + ((aFi?.sampleRate || 44100) / 1000);
        const bScore = (bFi?.isHiRes ? 2000 : 0) + (bFi?.bitDepth || 16) * 10 + ((bFi?.sampleRate || 44100) / 1000);
        return bScore - aScore;
      });
    }

    return result;
  }, [tracks, searchQuery, sortBy]);

  // Filtered albums
  const filteredAlbums = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return albums;
    return albums.filter((a) => a.name.toLowerCase().includes(q) || a.artist.toLowerCase().includes(q));
  }, [albums, searchQuery]);

  // Filtered artists
  const filteredArtists = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return artists;
    return artists.filter((a) => a.name.toLowerCase().includes(q));
  }, [artists, searchQuery]);

  // Selected Album Detail view
  const activeAlbum = useMemo(() => {
    if (!selectedAlbumId) return null;
    return albums.find((a) => a.id === selectedAlbumId) || null;
  }, [albums, selectedAlbumId]);

  return (
    <div className="mx-(--body-gutter) pt-8 pb-20" onDrop={onDrop} onDragOver={onDragOver}>
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

      {/* Clean, Unified Header */}
      <div className="mb-6 flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={() => {
                const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
                if (idx > 0) window.history.back();
                else window.location.hash = '#/home';
              }}
              className="grid size-9 place-items-center rounded-full bg-white/5 hover:bg-white/15 text-primary active:scale-95 transition-all cursor-pointer"
              title="Go back"
              aria-label="Go back"
            >
              <ChevronLeft size={20} strokeWidth={2.2} />
            </button>
            <div>
              <h1 className="type-header-emphasized leading-tight">Local Files</h1>
              <p className="mt-0.5 type-callout text-secondary">
                {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
                {totalSec > 0 ? ` · ${formatDuration(totalSec)}` : ''}
                {totalBytes > 0 ? ` · ${formatBytes(totalBytes)}` : ''}
                {hiResCount > 0 ? ` · ${hiResCount} Hi-Res Lossless` : ''}
              </p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleOpenFiles}
              disabled={isScanning}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] px-3.5 text-xs font-semibold text-white/90 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
            >
              <FileAudio size={15} />
              <span>Open Files</span>
            </button>

            <button
              onClick={handleOpenFolder}
              disabled={isScanning}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] px-3.5 text-xs font-semibold text-white/90 hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
            >
              <FolderPlus size={15} />
              <span>{currentFolder ? 'Change Folder' : 'Open Folder'}</span>
            </button>

            {tracks.length > 0 && (
              <>
                <button
                  onClick={() => playList(filteredTracks.length ? filteredTracks : tracks, 0, LOCAL_CONTEXT)}
                  className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-key px-4 text-xs font-bold text-white hover:brightness-110 shadow-sm shadow-key/30 transition-all cursor-pointer"
                >
                  <Play size={15} fill="currentColor" />
                  <span>Play All</span>
                </button>

                <button
                  onClick={() => shuffleList(filteredTracks.length ? filteredTracks : tracks, LOCAL_CONTEXT)}
                  className="grid size-9 place-items-center rounded-[10px] bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-white/80 hover:text-white transition-colors cursor-pointer"
                  title="Shuffle All"
                >
                  <Shuffle size={16} />
                </button>

                <button
                  onClick={() => {
                    localTracksManager.clear();
                    localTracksManager.setCurrentFolder(null);
                  }}
                  className="grid size-9 place-items-center rounded-[10px] bg-white/[0.06] hover:bg-red-500/20 border border-white/[0.08] text-white/50 hover:text-red-400 hover:border-red-500/30 transition-colors cursor-pointer"
                  title="Clear Library"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Clean Folder Bar */}
        {currentFolder && (
          <div className="flex items-center gap-2 text-xs text-secondary/80 mt-1 pl-12.5">
            <Folder size={13} className="text-key shrink-0" />
            <span className="truncate max-w-xl text-secondary" title={currentFolder}>
              {currentFolder}
            </span>
            <span className="text-white/20">·</span>
            <button
              onClick={handleRevealFolder}
              className="text-secondary hover:text-primary transition-colors cursor-pointer inline-flex items-center gap-1"
              title="Reveal folder in File Explorer"
            >
              <FolderOpen size={11} />
              <span>Reveal</span>
            </button>
            <span className="text-white/20">·</span>
            <button
              onClick={handleRescan}
              disabled={isScanning}
              className="text-key hover:underline transition-colors disabled:opacity-50 cursor-pointer inline-flex items-center gap-1 font-medium"
              title="Rescan this folder"
            >
              <RefreshCw size={11} className={isScanning ? 'animate-spin' : ''} />
              <span>Rescan</span>
            </button>
          </div>
        )}
      </div>

      {isScanning && (
        <div className="mb-4 flex items-center gap-2.5 p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-secondary text-xs">
          <RefreshCw size={14} className="animate-spin text-key shrink-0" />
          <span>Scanning audio library and extracting tags & artwork…</span>
        </div>
      )}

      {/* Main Content Area */}
      {tracks.length === 0 && !isScanning ? (
        <div
          onClick={handleOpenFolder}
          className="mt-8 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-white/[0.1] bg-white/[0.02] p-12 text-center cursor-pointer hover:border-key/60 hover:bg-white/[0.04] transition-all"
        >
          <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-white/[0.05] text-key shadow-inner">
            <Disc3 size={32} />
          </div>
          <h2 className="text-xl font-bold text-white">No local music loaded</h2>
          <p className="mt-1.5 max-w-sm text-xs text-white/60 leading-relaxed">
            Select your music folder once. SudinChord will remember it and automatically load your tracks every time.
          </p>
          <button className="mt-5 inline-flex h-10 items-center gap-2 rounded-[10px] bg-key px-5 text-xs font-bold text-white hover:brightness-110 shadow-md shadow-key/30 transition-all cursor-pointer">
            <FolderPlus size={16} />
            <span>Choose Music Folder</span>
          </button>
        </div>
      ) : (
        <>
          {/* View Switcher, Search, and Sort Toolbar (visible in main library views) */}
          {!activeAlbum && !selectedArtistName && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 p-1.5 rounded-[12px] bg-white/[0.03] border border-white/[0.06]">
              {/* Segmented View Switcher */}
              <div className="inline-flex p-1 rounded-[10px] bg-black/40 border border-white/[0.08] shrink-0">
                <button
                  onClick={() => {
                    setViewMode('songs');
                    setSelectedAlbumId(null);
                    setSelectedArtistName(null);
                  }}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-[8px] text-xs transition-all cursor-pointer ${
                    viewMode === 'songs'
                      ? 'bg-white/15 text-white font-semibold shadow-xs'
                      : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  <List size={13} />
                  <span>Songs</span>
                  <span className="px-1.5 py-0.5 rounded-[5px] bg-white/10 text-[10px] font-mono text-white/70">
                    {tracks.length}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setViewMode('albums');
                    setSelectedArtistName(null);
                  }}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-[8px] text-xs transition-all cursor-pointer ${
                    viewMode === 'albums'
                      ? 'bg-white/15 text-white font-semibold shadow-xs'
                      : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  <Disc3 size={13} />
                  <span>Albums</span>
                  <span className="px-1.5 py-0.5 rounded-[5px] bg-white/10 text-[10px] font-mono text-white/70">
                    {albums.length}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setViewMode('artists');
                    setSelectedAlbumId(null);
                  }}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-[8px] text-xs transition-all cursor-pointer ${
                    viewMode === 'artists'
                      ? 'bg-white/15 text-white font-semibold shadow-xs'
                      : 'text-white/60 hover:text-white hover:bg-white/[0.05]'
                  }`}
                >
                  <Users size={13} />
                  <span>Artists</span>
                  <span className="px-1.5 py-0.5 rounded-[5px] bg-white/10 text-[10px] font-mono text-white/70">
                    {artists.length}
                  </span>
                </button>
              </div>

              {/* In-Library Search & Sort */}
              <div className="flex items-center gap-2 flex-1 max-w-md justify-end">
                {/* Search Input */}
                <div className="relative flex-1 max-w-xs">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search in local library…"
                    className="w-full bg-white/[0.04] hover:bg-white/[0.06] focus:bg-white/[0.08] border border-white/[0.08] focus:border-key/60 rounded-[10px] pl-8 pr-7 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Sort Selector */}
                {viewMode === 'songs' && (
                  <div className="relative flex items-center shrink-0">
                    <ArrowUpDown size={12} className="absolute left-2.5 text-white/40 pointer-events-none" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      aria-label="Sort tracks by"
                      className="bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] rounded-[10px] pl-7 pr-3 py-1.5 text-xs text-white/80 hover:text-white focus:outline-none focus:border-key/60 cursor-pointer transition-all"
                    >
                      <option value="default" className="bg-[#1c1c1e] text-white">Default Order</option>
                      <option value="title-asc" className="bg-[#1c1c1e] text-white">Title (A-Z)</option>
                      <option value="title-desc" className="bg-[#1c1c1e] text-white">Title (Z-A)</option>
                      <option value="artist-asc" className="bg-[#1c1c1e] text-white">Artist (A-Z)</option>
                      <option value="album-asc" className="bg-[#1c1c1e] text-white">Album (A-Z)</option>
                      <option value="duration-desc" className="bg-[#1c1c1e] text-white">Duration (Longest)</option>
                      <option value="duration-asc" className="bg-[#1c1c1e] text-white">Duration (Shortest)</option>
                      <option value="quality" className="bg-[#1c1c1e] text-white">Quality (Hi-Res first)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Active Album Detail View */}
          {activeAlbum ? (
            <div className="space-y-6">
              <button
                onClick={() => setSelectedAlbumId(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <ChevronLeft size={16} />
                <span>Back to Albums</span>
              </button>

              <div className="flex flex-col sm:flex-row items-start sm:items-end gap-6 bg-white/[0.03] p-6 rounded-2xl border border-white/[0.07]">
                <div className="size-40 flex-none rounded-xl overflow-hidden bg-white/[0.05] shadow-2xl border border-white/[0.06]">
                  {activeAlbum.artworkUri ? (
                    <img
                      src={activeAlbum.artworkUri}
                      alt={activeAlbum.name}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="size-full flex items-center justify-center text-white/30">
                      <Disc3 size={48} />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-wider font-bold text-key">Album</p>
                  <h1 className="text-2xl sm:text-3xl font-bold text-white truncate mt-1">
                    {activeAlbum.name}
                  </h1>
                  <p className="text-sm font-medium text-white/70 mt-1">{activeAlbum.artist}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-white/50">
                    <span>{activeAlbum.tracks.length} songs</span>
                    <span>·</span>
                    <span>{formatDuration(activeAlbum.tracks.reduce((acc, t) => acc + (t.durationSec || 0), 0))}</span>
                    {activeAlbum.isHiRes && (
                      <span className="ml-1 inline-flex items-center gap-1 rounded-[5px] bg-amber-400/20 border border-amber-400/35 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                        <Sparkles size={10} />
                        HI-RES
                      </span>
                    )}
                  </div>

                  <div className="mt-4 flex items-center gap-3">
                    <button
                      onClick={() => playList(activeAlbum.tracks, 0, LOCAL_CONTEXT)}
                      className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-key px-5 text-xs font-bold text-white hover:brightness-110 shadow-md shadow-key/30 transition-all cursor-pointer"
                    >
                      <Play size={15} fill="currentColor" />
                      <span>Play Album</span>
                    </button>
                    <button
                      onClick={() => shuffleList(activeAlbum.tracks, LOCAL_CONTEXT)}
                      className="grid size-9 place-items-center rounded-[10px] bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-white/80 hover:text-white transition-colors cursor-pointer"
                      title="Shuffle Album"
                    >
                      <Shuffle size={16} />
                    </button>
                  </div>
                </div>
              </div>

              <TrackList tracks={activeAlbum.tracks} variant="playlist" source={LOCAL_CONTEXT.source} noGutter />
            </div>
          ) : selectedArtistName ? (
            /* Active Artist Filter View */
            <div className="space-y-6">
              <button
                onClick={() => setSelectedArtistName(null)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <ChevronLeft size={16} />
                <span>Back to Artists</span>
              </button>

              <div className="flex items-center gap-5 bg-white/[0.03] p-6 rounded-2xl border border-white/[0.07]">
                <div className="size-20 rounded-2xl overflow-hidden bg-white/[0.05] border border-white/[0.08] grid place-items-center text-white font-bold text-2xl flex-none shadow-lg">
                  {selectedArtistName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-key">Artist</p>
                  <h1 className="text-2xl font-bold text-white">{selectedArtistName}</h1>
                  <p className="text-xs text-white/60 mt-1">
                    {tracks.filter((t) => t.artists?.[0]?.name === selectedArtistName).length} local tracks in your library
                  </p>
                </div>
              </div>

              <TrackList
                tracks={tracks.filter((t) => t.artists?.[0]?.name === selectedArtistName)}
                variant="playlist"
                source={LOCAL_CONTEXT.source}
                noGutter
              />
            </div>
          ) : viewMode === 'albums' ? (
            /* Albums Grid View */
            filteredAlbums.length === 0 ? (
              <div className="py-20 text-center text-white/50">
                <p>No albums matching &ldquo;{searchQuery}&rdquo;</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-key text-xs font-semibold hover:underline cursor-pointer"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredAlbums.map((album) => (
                  <div
                    key={album.id}
                    onClick={() => setSelectedAlbumId(album.id)}
                    className="group relative cursor-pointer rounded-2xl p-3 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] hover:border-white/[0.1] transition-all duration-300"
                  >
                    {/* Artwork Container */}
                    <div className="relative aspect-square w-full rounded-xl overflow-hidden bg-white/[0.04] shadow-md mb-3">
                      {album.artworkUri ? (
                        <img
                          src={album.artworkUri}
                          alt={album.name}
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="size-full flex items-center justify-center text-white/20">
                          <Disc3 size={40} />
                        </div>
                      )}
                    </div>

                    {/* Album Info */}
                    <h3 className="text-xs font-bold text-white truncate" title={album.name}>
                      {album.name}
                    </h3>
                    <p className="text-[11px] text-white/60 truncate mt-0.5" title={album.artist}>
                      {album.artist}
                    </p>
                    <p className="text-[10px] text-white/40 mt-1">
                      {album.tracks.length} {album.tracks.length === 1 ? 'song' : 'songs'}
                    </p>
                  </div>
                ))}
              </div>
            )
          ) : viewMode === 'artists' ? (
            /* Artists Grid View */
            filteredArtists.length === 0 ? (
              <div className="py-20 text-center text-white/50">
                <p>No artists matching &ldquo;{searchQuery}&rdquo;</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-key text-xs font-semibold hover:underline cursor-pointer"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredArtists.map((artist) => (
                  <div
                    key={artist.name}
                    onClick={() => setSelectedArtistName(artist.name)}
                    className="group cursor-pointer rounded-2xl p-4 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] hover:border-white/[0.1] transition-all duration-300 text-center flex flex-col items-center"
                  >
                    <div className="size-28 rounded-2xl overflow-hidden bg-white/[0.04] border border-white/[0.06] shadow-md mb-3 group-hover:ring-2 group-hover:ring-key/60 transition-all flex items-center justify-center">
                      {artist.artworkUri ? (
                        <img
                          src={artist.artworkUri}
                          alt={artist.name}
                          className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <span className="text-2xl font-bold text-white/50">
                          {artist.name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <h3 className="text-xs font-bold text-white truncate w-full" title={artist.name}>
                      {artist.name}
                    </h3>
                    <p className="text-[10px] text-white/50 mt-1">
                      {artist.tracks.length} {artist.tracks.length === 1 ? 'song' : 'songs'}
                      {artist.albumCount > 1 ? ` · ${artist.albumCount} albums` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* Songs View (TrackList) */
            filteredTracks.length === 0 ? (
              <div className="py-20 text-center text-white/50">
                <p>No tracks matching &ldquo;{searchQuery}&rdquo;</p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="mt-2 text-key text-xs font-semibold hover:underline cursor-pointer"
                >
                  Clear search
                </button>
              </div>
            ) : (
              <TrackList tracks={filteredTracks} variant="playlist" source={LOCAL_CONTEXT.source} noGutter />
            )
          )}
        </>
      )}
    </div>
  );
}

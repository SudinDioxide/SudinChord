import { useEffect } from 'react';
import { getPlayhead, usePlayer, type NowPlaying } from '@/state/player';
import { useVideo } from '@/state/video';
import { lookupLyrics } from '@/lyrics/repository';
import { romajiOf } from '@/data/match/trackMatcher';
import { initMiniPlayerStream } from './miniPlayerStream';

interface ElectronPlatform {
  isElectron?: boolean;
  sendMediaState?: (state: {
    title: string;
    artist: string;
    artworkUrl: string | null;
    durationSec: number;
    positionSec?: number;
    status: string;
    playing: boolean;
    shuffle?: boolean;
    volume?: number;
    muted?: boolean;
    isVideo?: boolean;
    videoAspect?: number;
  }) => void;
  sendLyrics?: (lyrics: {
    videoId: string;
    synced: boolean;
    loading?: boolean;
    lines: { timeMs: number; text: string; romanized?: string; translation?: string }[];
  }) => void;
  onMediaCommand?: (callback: (cmd: string, data?: unknown) => void) => () => void;
  toggleMiniPlayer?: () => void;
}

function getElectronPlatform(): ElectronPlatform | undefined {
  return (window as unknown as { electronPlatform?: ElectronPlatform }).electronPlatform;
}

let lastFetchedLyricsVideoId = '';

async function fetchLyricsForMiniPlayer(nowPlaying: NowPlaying, ep: ElectronPlatform | undefined) {
  if (!ep?.sendLyrics || !nowPlaying?.videoId || !nowPlaying.title) return;
  if (lastFetchedLyricsVideoId === nowPlaying.videoId) return;
  lastFetchedLyricsVideoId = nowPlaying.videoId;

  // Immediately notify mini-player that a new track is loading lyrics
  ep.sendLyrics({
    videoId: nowPlaying.videoId,
    synced: false,
    loading: true,
    lines: [],
  });

  try {
    // 1. If local track with embedded lyrics
    if (nowPlaying.videoId.startsWith('local:')) {
      const { localTracksManager } = await import('@/playback/local/localTracks');
      const media = localTracksManager.getMedia(nowPlaying.videoId);
      if (media?.lyrics) {
        const { parseLrc, plainLines } = await import('@/lyrics/parse');
        const isLrc = /\[\d{1,2}:\d{2}[.:]\d{2,3}\]/.test(media.lyrics);
        const parsedLines = isLrc ? parseLrc(media.lyrics) : plainLines(media.lyrics);
        if (parsedLines.length) {
          ep.sendLyrics({
            videoId: nowPlaying.videoId,
            synced: parsedLines.some((l) => l.timeMs > 0),
            lines: parsedLines.map((l) => {
              const isKana = /[\u3040-\u30ff]/.test(l.text);
              const romanized = l.romanized || (isKana ? romajiOf(l.text) : undefined);
              return {
                timeMs: l.timeMs,
                text: l.text,
                romanized,
                translation: l.translation || undefined,
              };
            }),
          });
          return;
        }
      }
    }

    // 2. Fetch from lyrics repository
    const result = await lookupLyrics({
      videoId: nowPlaying.videoId,
      title: nowPlaying.title,
      artist: nowPlaying.artist,
      durationMs: Math.round(nowPlaying.durationSec * 1000),
      album: null,
    });

    if (result && result.lines.length) {
      ep.sendLyrics({
        videoId: nowPlaying.videoId,
        synced: result.synced,
        lines: result.lines.map((l) => {
          const isKana = /[\u3040-\u30ff]/.test(l.text);
          const romanized = l.romanized || (isKana ? romajiOf(l.text) : undefined);
          return {
            timeMs: l.timeMs,
            text: l.text,
            romanized,
            translation: l.translation || undefined,
          };
        }),
      });
    } else {
      ep.sendLyrics({
        videoId: nowPlaying.videoId,
        synced: false,
        lines: [],
      });
    }
  } catch (err) {
    console.warn('[MiniPlayer Lyrics] Lookup error:', err);
    ep.sendLyrics({
      videoId: nowPlaying.videoId,
      synced: false,
      lines: [],
    });
  }
}

export function useMediaSession(): void {
  useEffect(() => {
    const ep = getElectronPlatform();

    // 1. Setup incoming media commands from Electron (Global shortcuts, Taskbar buttons, Mini-Player)
    let cleanupCommands: (() => void) | undefined;
    if (ep?.onMediaCommand) {
      cleanupCommands = ep.onMediaCommand((cmd: string, data?: unknown) => {
        const player = usePlayer.getState();
        switch (cmd) {
          case 'togglePlay':
            player.togglePlay();
            break;
          case 'play':
            player.play();
            break;
          case 'pause':
            player.pause();
            break;
          case 'next':
            player.next();
            break;
          case 'previous':
            player.previous();
            break;
          case 'toggleShuffle':
            player.toggleShuffle();
            break;
          case 'volumeUp':
            player.setVolume(Math.min(1, player.volume + 0.05));
            break;
          case 'volumeDown':
            player.setVolume(Math.max(0, player.volume - 0.05));
            break;
          case 'seek':
            if (typeof data === 'number') player.seek(data);
            break;
          case 'toggleMiniPlayer':
            ep?.toggleMiniPlayer?.();
            break;
        }
      });
    }

    // 2. Setup standard Web MediaSession API (Controls SMTC in Chromium/Windows 11)
    if ('mediaSession' in navigator) {
      const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
        ['play', () => usePlayer.getState().play()],
        ['pause', () => usePlayer.getState().pause()],
        ['previoustrack', () => usePlayer.getState().previous()],
        ['nexttrack', () => usePlayer.getState().next()],
        [
          'seekto',
          (details) => {
            if (details.seekTime != null) usePlayer.getState().seek(details.seekTime);
          },
        ],
        [
          'seekbackward',
          () => {
            const p = usePlayer.getState();
            const dur = p.nowPlaying?.durationSec || 0;
            p.seek(Math.max(0, dur - 10));
          },
        ],
        [
          'seekforward',
          () => {
            const p = usePlayer.getState();
            const dur = p.nowPlaying?.durationSec || 0;
            p.seek(Math.min(dur, dur + 10));
          },
        ],
      ];

      for (const [action, handler] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, handler);
        } catch {
          // Some actions might not be supported on all browsers
        }
      }
    }

    // 3. Subscribe to Zustand store to keep SMTC & Electron in sync
    const unsubscribe = usePlayer.subscribe((state) => {
      const { nowPlaying, status } = state;
      const isPlaying = status === 'playing';

      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = isPlaying
          ? 'playing'
          : status === 'paused'
            ? 'paused'
            : 'none';

        if (nowPlaying) {
          const artwork: MediaImage[] = [];
          if (nowPlaying.artworkUrl) {
            artwork.push(
              { src: nowPlaying.artworkUrl, sizes: '96x96', type: 'image/png' },
              { src: nowPlaying.artworkUrl, sizes: '128x128', type: 'image/png' },
              { src: nowPlaying.artworkUrl, sizes: '192x192', type: 'image/png' },
              { src: nowPlaying.artworkUrl, sizes: '256x256', type: 'image/png' },
              { src: nowPlaying.artworkUrl, sizes: '512x512', type: 'image/png' },
            );
          }

          navigator.mediaSession.metadata = new MediaMetadata({
            title: nowPlaying.title || 'SudinChord',
            artist: nowPlaying.artist || 'SudinChord Music',
            album: 'SudinChord',
            artwork,
          });

          if (nowPlaying.durationSec > 0 && typeof navigator.mediaSession.setPositionState === 'function') {
            try {
              navigator.mediaSession.setPositionState({
                duration: nowPlaying.durationSec,
                playbackRate: 1,
                position: 0,
              });
            } catch { }
          }
        } else {
          navigator.mediaSession.metadata = null;
        }
      }

      // Notify Electron for Taskbar Thumbnail toolbar & Mini-Player
      if (ep?.sendMediaState) {
        const playhead = getPlayhead();
        const videoState = useVideo.getState();
        const hasVideo = !!nowPlaying?.videoId && videoState.videoId === nowPlaying.videoId;

        ep.sendMediaState({
          title: nowPlaying?.title || '',
          artist: nowPlaying?.artist || '',
          artworkUrl: nowPlaying?.artworkUrl || null,
          durationSec: nowPlaying?.durationSec || 0,
          positionSec: playhead?.sec ?? 0,
          status,
          playing: isPlaying,
          shuffle: state.shuffle,
          volume: state.volume,
          muted: state.muted,
          isVideo: hasVideo,
          videoAspect: videoState.aspect || (16 / 9),
        });

        if (nowPlaying) {
          void fetchLyricsForMiniPlayer(nowPlaying, ep);
        }
      }
    });

    // 4. Periodic position reporting for mini-player scrubber
    const progressTimer = setInterval(() => {
      const p = usePlayer.getState();
      if (p.status === 'playing' && ep?.sendMediaState && p.nowPlaying) {
        const playhead = getPlayhead();
        const videoState = useVideo.getState();
        const hasVideo = !!p.nowPlaying.videoId && videoState.videoId === p.nowPlaying.videoId;

        ep.sendMediaState({
          title: p.nowPlaying.title || '',
          artist: p.nowPlaying.artist || '',
          artworkUrl: p.nowPlaying.artworkUrl || null,
          durationSec: p.nowPlaying.durationSec || 0,
          positionSec: playhead?.sec ?? 0,
          status: p.status,
          playing: true,
          shuffle: p.shuffle,
          volume: p.volume,
          muted: p.muted,
          isVideo: hasVideo,
          videoAspect: videoState.aspect || (16 / 9),
        });
      }
    }, 1000);

    // 5. Initialize WebRTC loopback stream for floating mini-player music video
    const cleanupStream = initMiniPlayerStream();

    return () => {
      cleanupCommands?.();
      clearInterval(progressTimer);
      cleanupStream();
      unsubscribe();
    };
  }, []);
}


import { useQuery } from '@tanstack/react-query';
import { create } from 'zustand';
import { usePlayer } from '@/state/player';
import { queryClient } from '@/lib/queryClient';
import { onGranted } from './http';
import { forgetLyrics, lookupLyrics, type LyricsResult, type SourceState } from './repository';
import { useLyricsSettings } from './settings';
import type { LyricsSourceId } from './sources';

/** Per track: the provider the user picked in the panel, and how each provider's search went. */
interface LyricsUi {
  picked: Record<string, LyricsSourceId>;
  states: Record<string, Partial<Record<LyricsSourceId, SourceState>>>;
  pick: (videoId: string, source: LyricsSourceId | null) => void;
}

export const useLyricsUi = create<LyricsUi>()((set) => ({
  picked: {},
  states: {},
  pick: (videoId, source) =>
    set((s) => {
      const picked = { ...s.picked };
      if (source) picked[videoId] = source;
      else delete picked[videoId];
      return { picked };
    }),
}));

// A host the extension was refused for has been allowed: ask again.
onGranted(() => {
  forgetLyrics();
  void queryClient.invalidateQueries({ queryKey: ['lyrics'] });
});

function reportState(videoId: string, source: LyricsSourceId, state: SourceState) {
  queueMicrotask(() => {
    useLyricsUi.setState((s) => ({ states: { ...s.states, [videoId]: { ...s.states[videoId], [source]: state } } }));
  });
}

/** The playing track's lyrics, from the provider chain or the provider picked for it. */
export function useLyrics() {
  const videoId = usePlayer((s) => s.nowPlaying?.videoId ?? null);
  const title = usePlayer((s) => s.nowPlaying?.title ?? '');
  const artist = usePlayer((s) => s.nowPlaying?.artist ?? '');
  const only = useLyricsUi((s) => (videoId ? s.picked[videoId] : undefined));
  const order = useLyricsSettings((s) => s.order.filter((id) => !s.disabled.includes(id)).join(','));
  const preferSyllables = useLyricsSettings((s) => s.preferSyllables);
  const tamilScriptPreference = useLyricsSettings((s) => s.tamilScriptPreference);

  return useQuery<LyricsResult | null>({
    queryKey: ['lyrics', videoId, title, artist, only ?? null, order, preferSyllables, tamilScriptPreference],
    enabled: !!videoId && !!title,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
    queryFn: async () => {
      const player = usePlayer.getState();
      const entry = player.queue[player.index];
      const durationSec = entry?.track.durationSec || player.nowPlaying?.durationSec || 0;

      // Check if local track has embedded lyrics
      if (videoId?.startsWith('local:')) {
        try {
          const { localTracksManager } = await import('@/playback/local/localTracks');
          const media = localTracksManager.getMedia(videoId);
          if (media?.lyrics) {
            const { parseLrc, plainLines } = await import('./parse');
            const { writeTtml } = await import('./ttml');
            const isLrc = /\[\d{1,2}:\d{2}[.:]\d{2,3}\]/.test(media.lyrics);
            const parsedLines = isLrc ? parseLrc(media.lyrics) : plainLines(media.lyrics);
            if (parsedLines.length) {
              return {
                source: 'embedded' as LyricsSourceId,
                label: 'Embedded Lyrics',
                lines: parsedLines,
                ttml: writeTtml(parsedLines),
                wordSynced: parsedLines.some((l) => l.words.length > 0),
                synced: parsedLines.some((l) => l.timeMs > 0),
              };
            }
          }
        } catch {}
      }

      return lookupLyrics(
        {
          videoId: videoId!,
          title,
          artist,
          durationMs: Math.round(durationSec * 1000),
          album: entry?.track.album?.name ?? null,
        },
        { ...(only && { only }), onSource: (source, state) => reportState(videoId!, source, state) },
      );
    },
  });
}

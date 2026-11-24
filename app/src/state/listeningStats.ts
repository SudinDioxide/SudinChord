import { create } from 'zustand';
import { usePlayer, onTrackEnded } from '@/state/player';

export interface PlayRecord {
  id: string;
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  duration?: number;
  secondsListened: number;
  timestamp: number;
}

export interface StatsSummary {
  totalListeningMinutes: number;
  totalPlays: number;
  uniqueTracksCount: number;
  uniqueArtistsCount: number;
  streakDays: number;
  topTracks: Array<{
    videoId: string;
    title: string;
    artist: string;
    artworkUrl?: string;
    album?: string;
    plays: number;
    minutes: number;
  }>;
  topArtists: Array<{
    name: string;
    plays: number;
    minutes: number;
  }>;
  timeOfDay: {
    morning: number; // 6am - 12pm
    afternoon: number; // 12pm - 5pm
    evening: number; // 5pm - 10pm
    night: number; // 10pm - 6am
  };
  hourly: number[]; // 24-hour bins (0..23)
}

const STORAGE_KEY = 'sudinchord:listening-stats:v1';
const MAX_STORED_PLAYS = 1500;

function loadStoredPlays(): PlayRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

interface ListeningStatsStore {
  plays: PlayRecord[];
  recordPlay: (record: Omit<PlayRecord, 'id' | 'timestamp'>) => void;
  getStats: (range: 'all' | '30d' | '7d') => StatsSummary;
  clearHistory: () => void;
}

export const useListeningStats = create<ListeningStatsStore>((set, get) => ({
  plays: loadStoredPlays(),

  recordPlay(entry) {
    if (entry.secondsListened < 15) return; // Ignore very quick skips
    const record: PlayRecord = {
      ...entry,
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    };
    const updated = [record, ...get().plays].slice(0, MAX_STORED_PLAYS);
    set({ plays: updated });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  },

  getStats(range) {
    const now = Date.now();
    const cutoff = range === '7d' ? now - 7 * 86400000 : range === '30d' ? now - 30 * 86400000 : 0;
    const filtered = get().plays.filter((p) => p.timestamp >= cutoff);

    let totalSeconds = 0;
    const trackMap = new Map<string, { title: string; artist: string; artworkUrl?: string; album?: string; plays: number; seconds: number }>();
    const artistMap = new Map<string, { plays: number; seconds: number }>();
    const timeOfDay = { morning: 0, afternoon: 0, evening: 0, night: 0 };
    const hourly = new Array(24).fill(0);
    const activeDates = new Set<string>();

    for (const p of filtered) {
      totalSeconds += p.secondsListened;

      // Track aggregate
      const existingTrack = trackMap.get(p.videoId);
      if (existingTrack) {
        existingTrack.plays += 1;
        existingTrack.seconds += p.secondsListened;
        if (!existingTrack.artworkUrl && p.artworkUrl) existingTrack.artworkUrl = p.artworkUrl;
      } else {
        trackMap.set(p.videoId, {
          title: p.title,
          artist: p.artist,
          artworkUrl: p.artworkUrl,
          album: p.album,
          plays: 1,
          seconds: p.secondsListened,
        });
      }

      // Artist aggregate
      const artistName = p.artist || 'Unknown Artist';
      const existingArtist = artistMap.get(artistName);
      if (existingArtist) {
        existingArtist.plays += 1;
        existingArtist.seconds += p.secondsListened;
      } else {
        artistMap.set(artistName, { plays: 1, seconds: p.secondsListened });
      }

      // Time of day & 24h distribution
      const hour = new Date(p.timestamp).getHours();
      if (hour >= 0 && hour < 24) hourly[hour] = (hourly[hour] || 0) + 1;
      if (hour >= 6 && hour < 12) timeOfDay.morning++;
      else if (hour >= 12 && hour < 17) timeOfDay.afternoon++;
      else if (hour >= 17 && hour < 22) timeOfDay.evening++;
      else timeOfDay.night++;

      // Active dates for streak
      const dateStr = new Date(p.timestamp).toISOString().slice(0, 10);
      activeDates.add(dateStr);
    }

    // Calculate daily streak
    let streakDays = 0;
    let checkDate = new Date();
    while (true) {
      const dStr = checkDate.toISOString().slice(0, 10);
      if (activeDates.has(dStr)) {
        streakDays++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        if (streakDays === 0) {
          checkDate.setDate(checkDate.getDate() - 1);
          const yesterdayStr = checkDate.toISOString().slice(0, 10);
          if (activeDates.has(yesterdayStr)) {
            streakDays = 1;
            checkDate.setDate(checkDate.getDate() - 1);
            continue;
          }
        }
        break;
      }
    }

    const topTracks = Array.from(trackMap.entries())
      .map(([videoId, data]) => ({
        videoId,
        title: data.title,
        artist: data.artist,
        artworkUrl: data.artworkUrl,
        album: data.album,
        plays: data.plays,
        minutes: Math.round(data.seconds / 60),
      }))
      .sort((a, b) => b.plays - a.plays || b.minutes - a.minutes)
      .slice(0, 10);

    const topArtists = Array.from(artistMap.entries())
      .map(([name, data]) => ({
        name,
        plays: data.plays,
        minutes: Math.round(data.seconds / 60),
      }))
      .sort((a, b) => b.plays - a.plays || b.minutes - a.minutes)
      .slice(0, 8);

    return {
      totalListeningMinutes: Math.round(totalSeconds / 60),
      totalPlays: filtered.length,
      uniqueTracksCount: trackMap.size,
      uniqueArtistsCount: artistMap.size,
      streakDays,
      topTracks,
      topArtists,
      timeOfDay,
      hourly,
    };
  },

  clearHistory() {
    set({ plays: [] });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  },
}));

// Automatic Play Tracker
let activeSession: {
  videoId: string;
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
  duration?: number;
  secondsListened: number;
  lastTick: number;
} | null = null;

function flushActiveSession() {
  if (!activeSession) return;
  const s = activeSession;
  activeSession = null;
  if (s.secondsListened >= 15) {
    useListeningStats.getState().recordPlay({
      videoId: s.videoId,
      title: s.title,
      artist: s.artist,
      album: s.album,
      artworkUrl: s.artworkUrl,
      duration: s.duration,
      secondsListened: Math.round(s.secondsListened),
    });
  }
}

// Track end event
onTrackEnded(() => {
  flushActiveSession();
});

// Watch player status & current track
setInterval(() => {
  const { nowPlaying, status } = usePlayer.getState();
  const now = Date.now();

  if (!nowPlaying || status !== 'playing') {
    if (activeSession) {
      activeSession.lastTick = now;
    }
    return;
  }

  if (!activeSession || activeSession.videoId !== nowPlaying.videoId) {
    flushActiveSession();
    const currentQueueTrack = usePlayer.getState().queue[usePlayer.getState().index]?.track;
    activeSession = {
      videoId: nowPlaying.videoId,
      title: nowPlaying.title,
      artist: nowPlaying.artist,
      album: currentQueueTrack?.album?.name,
      artworkUrl: nowPlaying.artworkUrl ?? undefined,
      duration: nowPlaying.durationSec,
      secondsListened: 0,
      lastTick: now,
    };
    return;
  }

  // Active track is playing: accumulate elapsed time
  const elapsedSec = (now - activeSession.lastTick) / 1000;
  if (elapsedSec > 0 && elapsedSec < 10) {
    activeSession.secondsListened += elapsedSec;
  }
  activeSession.lastTick = now;
}, 2000);

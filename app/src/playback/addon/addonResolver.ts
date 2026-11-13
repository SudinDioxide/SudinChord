import { addonStore, type AddonTrack, type AddonStreamResult, type InstalledAddon } from '@/data/addon/addonManager';
import { best, type MatchTarget, type MatchCandidate } from '@/data/match/trackMatcher';

export interface ResolvedLosslessTrack {
  url: string;
  title: string;
  artist: string;
  durationSec: number;
  format: string;
  codec: string;
  bitrateKbps: number;
  sampleRateHz: number;
  sourceName: string;
}

interface PersistentCacheEntry {
  track: ResolvedLosslessTrack;
  savedAt: number;
}

const CACHE_STORAGE_KEY = 'sudinchord_lossless_cache_v1';
const CACHE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours
const MAX_CACHE_ENTRIES = 500;

function cleanTitle(rawTitle: string): string {
  return rawTitle
    .replace(/[\(\[](?:official\s*(?:music\s*)?video|video|audio|lyrics?|hd|4k|remastered?|visualizer|explicit)[\)\]]/gi, '')
    .replace(/\s*-\s*topic$/i, '')
    .trim();
}

function stripPackaging(rawTitle: string): string {
  return rawTitle
    .replace(/\s*[\(\[](?:from|feat|ft|original\s*motion\s*picture|soundtrack)[^\)\]]*[\)\]]/gi, '')
    .trim();
}

function primaryArtist(rawArtist: string): string {
  const cleaned = rawArtist.replace(/\s*-\s*topic$/i, '').trim();
  return cleaned.split(/[,&/;|×]/)[0]?.trim() || cleaned;
}

function cleanArtist(rawArtist: string): string {
  return rawArtist.replace(/\s*-\s*topic$/i, '').trim();
}

// Memory cache for fast lookups (0ms)
const resolvedCache = new Map<string, ResolvedLosslessTrack>();
// Deduplication map for queries in flight
const inFlightResolutions = new Map<string, Promise<ResolvedLosslessTrack | null>>();

function getCacheKey(title: string, artist: string): string {
  return `${cleanTitle(title).toLowerCase()}:::${cleanArtist(artist).toLowerCase()}`;
}

// Initialize persistent cache from localStorage
function initPersistentCache() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const raw = window.localStorage.getItem(CACHE_STORAGE_KEY);
    if (!raw) return;
    const data: Record<string, PersistentCacheEntry> = JSON.parse(raw);
    const now = Date.now();
    let hasExpired = false;
    for (const [key, entry] of Object.entries(data)) {
      if (entry && entry.track && now - entry.savedAt < CACHE_TTL_MS) {
        resolvedCache.set(key, entry.track);
      } else {
        hasExpired = true;
      }
    }
    if (hasExpired) {
      const valid = Object.fromEntries(
        Object.entries(data).filter(([_, e]) => e && e.track && now - e.savedAt < CACHE_TTL_MS)
      );
      window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(valid));
    }
  } catch {
    // Ignore JSON parse or storage errors
  }
}
initPersistentCache();

function saveToPersistentCache(key: string, track: ResolvedLosslessTrack) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const raw = window.localStorage.getItem(CACHE_STORAGE_KEY);
    const data: Record<string, PersistentCacheEntry> = raw ? JSON.parse(raw) : {};
    data[key] = { track, savedAt: Date.now() };

    const entries = Object.entries(data);
    if (entries.length > MAX_CACHE_ENTRIES) {
      entries.sort((a, b) => b[1].savedAt - a[1].savedAt);
      const trimmed = Object.fromEntries(entries.slice(0, MAX_CACHE_ENTRIES));
      window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(trimmed));
    } else {
      window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(data));
    }
  } catch {
    // Ignore storage quota exceeded
  }
}

export function getCachedLosslessTrack({
  title,
  artist,
}: {
  title: string;
  artist: string;
  durationSec?: number;
}): ResolvedLosslessTrack | null {
  const state = addonStore.getState();
  if (!state.losslessEnabled) return null;
  const key = getCacheKey(title, artist);
  return resolvedCache.get(key) || null;
}

async function querySingleAddon(
  addon: InstalledAddon,
  sTitle: string,
  sArtist: string,
  durationSec?: number,
  timeoutMs = 4000,
): Promise<ResolvedLosslessTrack | null> {
  const baseUrl = addon.url;
  const sourceName = addon.name || 'Lossless Addon';

  try {
    const strippedTitle = stripPackaging(sTitle);
    const pArtist = primaryArtist(sArtist);

    // Group queries into high-confidence artist queries and fallback queries
    const artistQueries = [
      ...new Set([
        pArtist ? `${strippedTitle} ${pArtist}` : strippedTitle,
        pArtist && sTitle !== strippedTitle ? `${sTitle} ${pArtist}` : '',
      ].filter(Boolean)),
    ];

    const fallbackQueries = [
      ...new Set([
        strippedTitle,
        sTitle !== strippedTitle ? sTitle : '',
      ].filter((q) => Boolean(q) && !artistQueries.includes(q))),
    ];

    const queryTimeout = Math.min(timeoutMs, 4000);

    const searchEndpoint = async (query: string): Promise<AddonTrack[]> => {
      const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(query)}`;
      const res = await fetch(searchUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'BitChord/1.9.1 (Linux; Android 14; com.music.bitchord)',
        },
        signal: AbortSignal.timeout(queryTimeout),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { tracks?: AddonTrack[] };
      if (Array.isArray(data?.tracks) && data.tracks.length > 0) {
        return data.tracks;
      }
      throw new Error('No tracks found');
    };

    let candidates: AddonTrack[] = [];

    // Parallel racing: Search top artist-targeted queries simultaneously
    if (artistQueries.length > 0) {
      try {
        candidates = await Promise.any(artistQueries.map((q) => searchEndpoint(q)));
      } catch {
        // artistQueries failed
      }
    }

    // If no candidates from artist queries, try fallback queries in parallel
    if (candidates.length === 0 && fallbackQueries.length > 0) {
      try {
        candidates = await Promise.any(fallbackQueries.map((q) => searchEndpoint(q)));
      } catch {
        // fallbackQueries failed
      }
    }

    if (candidates.length === 0) return null;

    // Use BitChord's strict track matcher to eliminate false positives
    const matchCandidates: (MatchCandidate & { raw: AddonTrack })[] = candidates
      .filter((c) => Boolean(c.id && c.title))
      .map((c) => ({
        title: c.title,
        artist: c.artist || '',
        durationSec: c.duration || (c.durationMs ? Math.round(c.durationMs / 1000) : null),
        album: c.album || null,
        raw: c,
      }));

    if (matchCandidates.length === 0) return null;

    const target: MatchTarget = {
      title: sTitle,
      artist: sArtist,
      durationSec: durationSec || null,
    };

    const matched = best(matchCandidates, target);
    if (!matched) return null;

    const bestTrack = matched.raw;

    // Fetch stream URL for the verified match
    let streamUrl = bestTrack.streamURL;
    let codec = bestTrack.format?.toUpperCase() || 'FLAC';
    let bitrateKbps = bestTrack.bitrate || 1411;
    let sampleRateHz = 44100;

    if (!streamUrl) {
      const streamEndpoint = `${baseUrl}/stream/${encodeURIComponent(bestTrack.id)}`;
      const streamRes = await fetch(streamEndpoint, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'BitChord/1.9.1 (Linux; Android 14; com.music.bitchord)',
        },
        signal: AbortSignal.timeout(Math.min(timeoutMs, 4000)),
      });
      if (!streamRes.ok) return null;

      const streamData = (await streamRes.json()) as AddonStreamResult;
      if (!streamData?.url) return null;

      streamUrl = streamData.url;
      if (streamData.codec) codec = streamData.codec.toUpperCase();
      if (streamData.bitrate || streamData.kbps) bitrateKbps = streamData.bitrate || streamData.kbps || 1411;
      if (streamData.sampleRate) sampleRateHz = streamData.sampleRate;
    }

    // Only accept genuine lossless or high-fidelity streams
    const isLossless =
      codec.includes('FLAC') ||
      codec.includes('ALAC') ||
      codec.includes('WAV') ||
      (bestTrack.audioQuality && bestTrack.audioQuality.toUpperCase() === 'LOSSLESS') ||
      bitrateKbps >= 800;

    if (!isLossless) return null;

    const candDur = bestTrack.duration || (bestTrack.durationMs ? Math.round(bestTrack.durationMs / 1000) : 0);

    const result: ResolvedLosslessTrack = {
      url: streamUrl,
      title: bestTrack.title,
      artist: bestTrack.artist || sArtist,
      durationSec: candDur || durationSec || 0,
      format: `${codec} ${bitrateKbps}kbps Lossless`,
      codec,
      bitrateKbps,
      sampleRateHz,
      sourceName,
    };

    const cacheKey = getCacheKey(sTitle, sArtist);
    resolvedCache.set(cacheKey, result);
    saveToPersistentCache(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

export async function resolveLosslessTrack({
  title,
  artist,
  durationSec,
  timeoutMs = 8000,
}: {
  title: string;
  artist: string;
  durationSec?: number;
  timeoutMs?: number;
}): Promise<ResolvedLosslessTrack | null> {
  const state = addonStore.getState();
  if (!state.losslessEnabled) return null;

  const sTitle = cleanTitle(title || '');
  const sArtist = cleanArtist(artist || '');
  if (!sTitle) return null;

  const cacheKey = getCacheKey(sTitle, sArtist);

  // Return cached result immediately if available (0ms)
  const cached = getCachedLosslessTrack({ title: sTitle, artist: sArtist });
  if (cached) return cached;

  // In-flight deduplication: return existing promise if already resolving
  const pending = inFlightResolutions.get(cacheKey);
  if (pending) return pending;

  // Only query active, enabled addons that are connected and healthy
  const activeAddons = state.addons.filter((a) => a.enabled && a.status === 'connected');
  if (activeAddons.length === 0) return null;

  const resolutionPromise = (async () => {
    try {
      const queryPromises = activeAddons.map((addon) =>
        querySingleAddon(addon, sTitle, sArtist, durationSec, timeoutMs)
      );

      const matchPromise = new Promise<ResolvedLosslessTrack | null>((resolve) => {
        let remaining = queryPromises.length;
        for (const p of queryPromises) {
          p.then((track) => {
            if (track) {
              resolve(track);
            } else {
              remaining--;
              if (remaining === 0) resolve(null);
            }
          }).catch(() => {
            remaining--;
            if (remaining === 0) resolve(null);
          });
        }
      });

      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), timeoutMs)
      );

      const resolved = await Promise.race([matchPromise, timeoutPromise]);
      if (resolved) {
        resolvedCache.set(cacheKey, resolved);
        saveToPersistentCache(cacheKey, resolved);
      }
      return resolved;
    } catch {
      return null;
    } finally {
      inFlightResolutions.delete(cacheKey);
    }
  })();

  inFlightResolutions.set(cacheKey, resolutionPromise);
  return resolutionPromise;
}

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

// Cache for resolved lossless tracks so repeated queries or cached tracks load instantly (0ms)
const resolvedCache = new Map<string, ResolvedLosslessTrack>();

function getCacheKey(title: string, artist: string): string {
  return `${cleanTitle(title).toLowerCase()}:::${cleanArtist(artist).toLowerCase()}`;
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

    // Multi-tier query strategies:
    // 1. Core title + primary artist (highest hit rate on streaming backends)
    // 2. Full title + primary artist
    // 3. Core title only
    // 4. Full title
    const searchQueries = [
      ...new Set([
        pArtist ? `${strippedTitle} ${pArtist}` : strippedTitle,
        pArtist && sTitle !== strippedTitle ? `${sTitle} ${pArtist}` : '',
        strippedTitle,
        sTitle !== strippedTitle ? sTitle : '',
      ].filter(Boolean)),
    ];

    let candidates: AddonTrack[] = [];
    const queryTimeout = Math.min(timeoutMs, 4000);
    for (const q of searchQueries) {
      const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(q)}`;
      try {
        const res = await fetch(searchUrl, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'BitChord/1.9.1 (Linux; Android 14; com.music.bitchord)',
          },
          signal: AbortSignal.timeout(queryTimeout),
        });
        if (res.ok) {
          const data = (await res.json()) as { tracks?: AddonTrack[] };
          if (Array.isArray(data?.tracks) && data.tracks.length > 0) {
            candidates = data.tracks;
            break;
          }
        }
      } catch {
        // Individual query timed out or errored
        continue;
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

    // Cache the verified match
    resolvedCache.set(getCacheKey(sTitle, sArtist), result);
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

  // Return cached result immediately if available
  const cached = getCachedLosslessTrack({ title: sTitle, artist: sArtist });
  if (cached) return cached;

  // Only query active, enabled addons that are connected and healthy
  const activeAddons = state.addons.filter((a) => a.enabled && a.status === 'connected');
  if (activeAddons.length === 0) return null;

  // Parallel resolution: query all active addons simultaneously,
  // bounded by the specified timeout cap so playback upgrade runs smoothly.
  try {
    const queryPromises = activeAddons.map((addon) =>
      querySingleAddon(addon, sTitle, sArtist, durationSec, timeoutMs)
    );

    const matchPromise = new Promise<ResolvedLosslessTrack | null>((resolve) => {
      let pending = queryPromises.length;
      for (const p of queryPromises) {
        p.then((track) => {
          if (track) {
            resolve(track);
          } else {
            pending--;
            if (pending === 0) resolve(null);
          }
        }).catch(() => {
          pending--;
          if (pending === 0) resolve(null);
        });
      }
    });

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), timeoutMs)
    );

    const resolved = await Promise.race([matchPromise, timeoutPromise]);
    if (resolved) {
      resolvedCache.set(getCacheKey(sTitle, sArtist), resolved);
    }
    return resolved;
  } catch {
    return null;
  }
}

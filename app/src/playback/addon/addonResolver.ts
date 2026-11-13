import { addonStore, type AddonTrack, type AddonStreamResult, type InstalledAddon } from '@/data/addon/addonManager';
import { resolveClashFlacTrack, getClashFlacConfig, isAacOrOpus } from './clashflacResolver';

export { isAacOrOpus };

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

function cleanArtist(rawArtist: string): string {
  return rawArtist.replace(/\s*-\s*topic$/i, '').trim();
}

async function querySingleAddon(
  addon: InstalledAddon,
  sTitle: string,
  sArtist: string,
  durationSec?: number,
): Promise<ResolvedLosslessTrack | null> {
  const baseUrl = addon.url;
  const sourceName = addon.name || 'Lossless Addon';

  try {
    const searchQueries = [
      sArtist ? `${sTitle} ${sArtist}` : sTitle,
      sTitle,
    ];

    let candidates: AddonTrack[] = [];
    for (const q of searchQueries) {
      const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(q)}`;
      const res = await fetch(searchUrl, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = (await res.json()) as { tracks?: AddonTrack[] };
        if (Array.isArray(data?.tracks) && data.tracks.length > 0) {
          candidates = data.tracks;
          break;
        }
      }
    }

    if (candidates.length === 0) return null;

    // Rank candidates
    const normTargetTitle = sTitle.toLowerCase().replace(/[^a-z0-9]/g, ' ');
    const targetWords = normTargetTitle.split(/\s+/).filter((w) => w.length > 1);

    let bestTrack: AddonTrack | null = null;
    let bestScore = -1;

    for (const cand of candidates) {
      if (!cand.id || !cand.title) continue;

      let score = 0;
      const candTitleNorm = cand.title.toLowerCase().replace(/[^a-z0-9]/g, ' ');

      // User constraint: ONLY play AAC and Opus streams
      const candFmt = cand.format || cand.audioQuality || '';
      if (candFmt && !isAacOrOpus(candFmt)) continue;

      // Word matches
      let matchedWords = 0;
      for (const word of targetWords) {
        if (candTitleNorm.includes(word)) matchedWords++;
      }
      if (targetWords.length > 0) {
        score += (matchedWords / targetWords.length) * 10;
      }

      // Artist match
      if (sArtist && cand.artist) {
        const candArtistNorm = cand.artist.toLowerCase();
        if (candArtistNorm.includes(sArtist.toLowerCase()) || sArtist.toLowerCase().includes(candArtistNorm)) {
          score += 5;
        }
      }

      // Quality preference (AAC/Opus)
      if (cand.format?.toLowerCase() === 'aac' || cand.format?.toLowerCase() === 'opus') {
        score += 5;
      }

      // Duration similarity
      const candDur = cand.duration || (cand.durationMs ? Math.round(cand.durationMs / 1000) : 0);
      if (durationSec && candDur > 0) {
        const diff = Math.abs(durationSec - candDur);
        if (diff <= 5) score += 6;
        else if (diff <= 15) score += 3;
        else if (diff > 90) score -= 8;
      }

      if (score > bestScore && score >= 7) {
        bestScore = score;
        bestTrack = cand;
      }
    }

    if (!bestTrack) return null;

    // Fetch stream URL for the best candidate
    let streamUrl = bestTrack.streamURL;
    let codec = bestTrack.format?.toUpperCase() || 'AAC';
    let bitrateKbps = bestTrack.bitrate || 320;
    let sampleRateHz = 44100;

    if (!streamUrl) {
      const streamEndpoint = `${baseUrl}/stream/${encodeURIComponent(bestTrack.id)}`;
      const streamRes = await fetch(streamEndpoint, { headers: { Accept: 'application/json' } });
      if (!streamRes.ok) return null;

      const streamData = (await streamRes.json()) as AddonStreamResult;
      if (!streamData?.url) return null;

      streamUrl = streamData.url;
      if (streamData.codec) codec = streamData.codec.toUpperCase();
      if (streamData.bitrate || streamData.kbps) bitrateKbps = streamData.bitrate || streamData.kbps || 320;
      if (streamData.sampleRate) sampleRateHz = streamData.sampleRate;
    }

    // Strictly enforce: ONLY play AAC and Opus
    if (!isAacOrOpus(codec, bestTrack.format)) return null;

    const candDur = bestTrack.duration || (bestTrack.durationMs ? Math.round(bestTrack.durationMs / 1000) : 0);

    return {
      url: streamUrl,
      title: bestTrack.title,
      artist: bestTrack.artist || sArtist,
      durationSec: candDur || durationSec || 0,
      format: `${codec} ${bitrateKbps}kbps`,
      codec,
      bitrateKbps,
      sampleRateHz,
      sourceName,
    };
  } catch {
    return null;
  }
}

export async function resolveLosslessTrack({
  title,
  artist,
  durationSec,
}: {
  title: string;
  artist: string;
  durationSec?: number;
}): Promise<ResolvedLosslessTrack | null> {
  const state = addonStore.getState();
  if (!state.losslessEnabled) return null;

  const sTitle = cleanTitle(title || '');
  const sArtist = cleanArtist(artist || '');
  if (!sTitle) return null;

  // 1. Check built-in ClashFLAC / JioSaavn / Tidal resolver (strictly AAC / Opus only)
  const clashConfig = getClashFlacConfig();
  if (clashConfig.enabled) {
    try {
      const clashMatch = await resolveClashFlacTrack({ title: sTitle, artist: sArtist, durationSec });
      if (clashMatch && isAacOrOpus(clashMatch.codec, clashMatch.format)) return clashMatch;
    } catch {}
  }

  // 2. Check user-configured custom addons (strictly AAC / Opus only)
  const enabledAddons = state.addons.filter((a) => a.enabled && a.status === 'connected');
  for (const addon of enabledAddons) {
    const match = await querySingleAddon(addon, sTitle, sArtist, durationSec);
    if (match && isAacOrOpus(match.codec, match.format)) return match;
  }

  return null;
}

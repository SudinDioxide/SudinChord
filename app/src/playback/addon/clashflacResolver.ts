import { trackLog } from '@/playback/trackLog';
import type { ResolvedLosslessTrack } from './addonResolver';

const STORAGE_ENABLED_KEY = 'sudinchord_clashflac_enabled';
const STORAGE_API_BASE_KEY = 'sudinchord_clashflac_api_base';
const STORAGE_PRIORITY_KEY = 'sudinchord_clashflac_priority';
const STORAGE_QUALITY_KEY = 'sudinchord_clashflac_quality';

const DEFAULT_API_BASE = 'https://clashflac.kanjijewels.com';
const JIOSAAVN_API = 'https://jiosavan.clashgram.workers.dev/api';

export type ClashEnginePriority = 'qobuz' | 'tidal' | 'jiosaavn';

export interface ClashFlacConfig {
  enabled: boolean;
  apiBase: string;
  priority: ClashEnginePriority;
  quality: 'UHD' | 'HD';
}

export function getClashFlacConfig(): ClashFlacConfig {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {
      enabled: true,
      apiBase: DEFAULT_API_BASE,
      priority: 'qobuz',
      quality: 'UHD',
    };
  }

  const enabled = localStorage.getItem(STORAGE_ENABLED_KEY) !== 'false';
  const apiBase = localStorage.getItem(STORAGE_API_BASE_KEY) || DEFAULT_API_BASE;
  const rawPriority = localStorage.getItem(STORAGE_PRIORITY_KEY) as ClashEnginePriority | null;
  const priority = rawPriority === 'tidal' || rawPriority === 'jiosaavn' || rawPriority === 'qobuz' ? rawPriority : 'qobuz';
  const quality = localStorage.getItem(STORAGE_QUALITY_KEY) === 'HD' ? 'HD' : 'UHD';

  return { enabled, apiBase: apiBase.replace(/\/+$/, ''), priority, quality };
}

export function setClashFlacConfig(config: Partial<ClashFlacConfig>) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  if (config.enabled !== undefined) localStorage.setItem(STORAGE_ENABLED_KEY, String(config.enabled));
  if (config.apiBase !== undefined) localStorage.setItem(STORAGE_API_BASE_KEY, config.apiBase.trim());
  if (config.priority !== undefined) localStorage.setItem(STORAGE_PRIORITY_KEY, config.priority);
  if (config.quality !== undefined) localStorage.setItem(STORAGE_QUALITY_KEY, config.quality);
}

function cleanQuery(text: string): string {
  return text
    .replace(/[\(\[](?:official\s*(?:music\s*)?video|video|audio|lyrics?|hd|4k|remastered?|visualizer|explicit)[\)\]]/gi, '')
    .replace(/\s*-\s*topic$/i, '')
    .trim();
}

/**
 * Fetch with strict timeout to prevent playback hangs
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 2800): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
      },
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

/**
 * 1. Query Qobuz via ClashFLAC
 * Supports up to 24-bit/192kHz Studio Master Lossless FLAC
 */
async function resolveQobuz(
  apiBase: string,
  title: string,
  artist: string,
  durationSec?: number,
): Promise<ResolvedLosslessTrack | null> {
  const query = artist ? `${title} ${artist}` : title;
  const searchUrl = `${apiBase}/api/qobuz/search?q=${encodeURIComponent(query)}&limit=5`;

  const searchRes = await fetchWithTimeout(searchUrl);
  if (!searchRes.ok) return null;

  const items = (await searchRes.json()) as Array<{
    asin?: string;
    id?: string | number;
    title?: string;
    artist?: string;
    duration_sec?: number;
    bit_depth?: number;
    sampling_rate?: number;
    hires?: boolean;
  }>;

  if (!Array.isArray(items) || items.length === 0) return null;

  // Best match selection
  let bestItem: (typeof items)[0] | null = null;
  let bestScore = -1;
  const normTitle = title.toLowerCase();

  for (const it of items) {
    if (!it.title || (!it.asin && !it.id)) continue;
    let score = 0;
    const itTitle = it.title.toLowerCase();

    if (itTitle.includes(normTitle) || normTitle.includes(itTitle)) score += 10;
    if (artist && it.artist && (it.artist.toLowerCase().includes(artist.toLowerCase()) || artist.toLowerCase().includes(it.artist.toLowerCase()))) {
      score += 5;
    }
    if (it.hires || (it.bit_depth && it.bit_depth > 16)) score += 4;
    if (durationSec && it.duration_sec) {
      const diff = Math.abs(durationSec - it.duration_sec);
      if (diff <= 5) score += 6;
      else if (diff <= 15) score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      bestItem = it;
    }
  }

  if (!bestItem || bestScore < 6) return null;

  const trackId = String(bestItem.asin || bestItem.id);

  // Try direct stream endpoint
  const streamUrl = `${apiBase}/api/qobuz/stream/${encodeURIComponent(trackId)}`;
  const streamRes = await fetchWithTimeout(streamUrl);
  if (streamRes.ok) {
    const streamData = (await streamRes.json()) as {
      stream_url?: string;
      format?: string;
      bit_depth?: number;
      sampling_rate?: number;
    };

    if (streamData?.stream_url) {
      const bitDepth = streamData.bit_depth || bestItem.bit_depth || 24;
      const sampleRate = streamData.sampling_rate || bestItem.sampling_rate || 96;
      const isHiRes = bitDepth > 16 || sampleRate > 44.1;
      const codec = streamData.format?.toUpperCase() || 'FLAC';

      return {
        url: streamData.stream_url,
        title: bestItem.title || title,
        artist: bestItem.artist || artist,
        durationSec: bestItem.duration_sec || durationSec || 0,
        format: `${codec} ${bitDepth}-bit/${sampleRate}kHz ${isHiRes ? 'Hi-Res Master' : 'Lossless CD'}`,
        codec,
        bitrateKbps: isHiRes ? 9216 : 1411,
        sampleRateHz: Math.round(Number(sampleRate) * 1000) || 44100,
        sourceName: 'Qobuz Hi-Res (ClashFLAC)',
      };
    }
  }

  // Fallback to resolve endpoint
  const resolveUrl = `${apiBase}/api/qobuz/resolve`;
  const resolveRes = await fetchWithTimeout(resolveUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: trackId, quality: 'UHD' }),
  });

  if (resolveRes.ok) {
    const resData = (await resolveRes.json()) as {
      stream_url?: string;
      codec?: string;
      bit_depth?: number;
      sample_rate?: number;
      hires?: boolean;
    };

    if (resData?.stream_url) {
      const bitDepth = resData.bit_depth || 24;
      const sampleRateHz = resData.sample_rate || 96000;
      const codec = resData.codec?.toUpperCase() || 'FLAC';
      return {
        url: resData.stream_url,
        title: bestItem.title || title,
        artist: bestItem.artist || artist,
        durationSec: bestItem.duration_sec || durationSec || 0,
        format: `${codec} ${bitDepth}-bit ${resData.hires ? 'Hi-Res' : 'Lossless'}`,
        codec,
        bitrateKbps: bitDepth > 16 ? 9216 : 1411,
        sampleRateHz,
        sourceName: 'Qobuz (ClashFLAC)',
      };
    }
  }

  return null;
}

/**
 * 2. Query Tidal via ClashFLAC
 * Supports 16-bit / 24-bit FLAC HiFi streams
 */
async function resolveTidal(
  apiBase: string,
  title: string,
  artist: string,
  durationSec?: number,
): Promise<ResolvedLosslessTrack | null> {
  const query = artist ? `${title} ${artist}` : title;
  const searchUrl = `${apiBase}/api/tidal/search?q=${encodeURIComponent(query)}&limit=5`;

  const searchRes = await fetchWithTimeout(searchUrl);
  if (!searchRes.ok) return null;

  const items = (await searchRes.json()) as Array<{
    asin?: string;
    id?: string | number;
    title?: string;
    artist?: string;
    duration_sec?: number;
    audio_quality?: string;
  }>;

  if (!Array.isArray(items) || items.length === 0) return null;

  let bestItem: (typeof items)[0] | null = null;
  let bestScore = -1;
  const normTitle = title.toLowerCase();

  for (const it of items) {
    if (!it.title || (!it.asin && !it.id)) continue;
    let score = 0;
    const itTitle = it.title.toLowerCase();

    if (itTitle.includes(normTitle) || normTitle.includes(itTitle)) score += 10;
    if (artist && it.artist && (it.artist.toLowerCase().includes(artist.toLowerCase()) || artist.toLowerCase().includes(it.artist.toLowerCase()))) {
      score += 5;
    }
    if (it.audio_quality?.toUpperCase() === 'LOSSLESS' || it.audio_quality?.toUpperCase() === 'HIRES') score += 4;
    if (durationSec && it.duration_sec) {
      const diff = Math.abs(durationSec - it.duration_sec);
      if (diff <= 5) score += 6;
      else if (diff <= 15) score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      bestItem = it;
    }
  }

  if (!bestItem || bestScore < 6) return null;

  const trackId = String(bestItem.asin || bestItem.id);

  const resolveUrl = `${apiBase}/api/tidal/resolve`;
  const resolveRes = await fetchWithTimeout(resolveUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: trackId, quality: 'HD' }),
  });

  if (resolveRes.ok) {
    const resData = (await resolveRes.json()) as {
      stream_url?: string;
      codec?: string;
      bitrate?: number;
      sample_rate?: number;
      bit_depth?: number;
    };

    if (resData?.stream_url) {
      const codec = resData.codec?.toUpperCase() || 'FLAC';
      const bitrateKbps = resData.bitrate || 1411;
      return {
        url: resData.stream_url,
        title: bestItem.title || title,
        artist: bestItem.artist || artist,
        durationSec: bestItem.duration_sec || durationSec || 0,
        format: `${codec} ${bitrateKbps}kbps Lossless`,
        codec,
        bitrateKbps,
        sampleRateHz: resData.sample_rate || 44100,
        sourceName: 'Tidal HiFi (ClashFLAC)',
      };
    }
  }

  return null;
}

/**
 * 3. Query JioSaavn Hi-Fi 320kbps Direct Stream
 */
async function resolveJioSaavn(
  title: string,
  artist: string,
  durationSec?: number,
): Promise<ResolvedLosslessTrack | null> {
  const query = artist ? `${title} ${artist}` : title;
  const searchUrl = `${JIOSAAVN_API}/search/songs?query=${encodeURIComponent(query)}&limit=5`;

  const searchRes = await fetchWithTimeout(searchUrl);
  if (!searchRes.ok) return null;

  const data = (await searchRes.json()) as {
    success?: boolean;
    data?: {
      results?: Array<{
        id: string;
        name: string;
        duration: number;
        artists?: { primary?: Array<{ name: string }> };
        downloadUrl?: Array<{ quality: string; url: string }>;
      }>;
    };
  };

  const results = data?.data?.results;
  if (!Array.isArray(results) || results.length === 0) return null;

  let bestSong: (typeof results)[0] | null = null;
  let bestScore = -1;
  const normTitle = title.toLowerCase();

  for (const song of results) {
    if (!song.id || !song.name) continue;
    let score = 0;
    const songName = song.name.toLowerCase();

    if (songName.includes(normTitle) || normTitle.includes(songName)) score += 10;
    const primaryArtists = song.artists?.primary?.map((a) => a.name.toLowerCase()).join(' ') || '';
    if (artist && primaryArtists && (primaryArtists.includes(artist.toLowerCase()) || artist.toLowerCase().includes(primaryArtists))) {
      score += 5;
    }
    if (durationSec && song.duration) {
      const diff = Math.abs(durationSec - song.duration);
      if (diff <= 5) score += 6;
      else if (diff <= 15) score += 3;
    }
    if (score > bestScore) {
      bestScore = score;
      bestSong = song;
    }
  }

  if (!bestSong || bestScore < 6) return null;

  let dlUrls = bestSong.downloadUrl;
  if (!dlUrls || dlUrls.length === 0) {
    // Fetch full song details
    const songUrl = `${JIOSAAVN_API}/songs/${encodeURIComponent(bestSong.id)}`;
    const songRes = await fetchWithTimeout(songUrl);
    if (songRes.ok) {
      const songData = (await songRes.json()) as { data?: Array<{ downloadUrl?: Array<{ quality: string; url: string }> }> };
      dlUrls = songData?.data?.[0]?.downloadUrl;
    }
  }

  if (!dlUrls || dlUrls.length === 0) return null;

  // Pick highest quality available (320kbps -> 160kbps)
  const stream320 = dlUrls.find((d) => d.quality === '320kbps') || dlUrls.find((d) => d.quality === '160kbps') || dlUrls[dlUrls.length - 1];
  if (!stream320?.url) return null;

  return {
    url: stream320.url,
    title: bestSong.name,
    artist: bestSong.artists?.primary?.map((a) => a.name).join(', ') || artist,
    durationSec: bestSong.duration || durationSec || 0,
    format: `AAC ${stream320.quality || '320kbps'} High Fidelity`,
    codec: 'AAC',
    bitrateKbps: stream320.quality === '320kbps' ? 320 : 160,
    sampleRateHz: 44100,
    sourceName: 'JioSaavn Hi-Fi',
  };
}

/**
 * Main ClashFLAC resolver
 * Queries Qobuz, Tidal, and JioSaavn according to configured priority.
 */
export async function resolveClashFlacTrack({
  title,
  artist,
  durationSec,
}: {
  title: string;
  artist: string;
  durationSec?: number;
}): Promise<ResolvedLosslessTrack | null> {
  const config = getClashFlacConfig();
  if (!config.enabled) return null;

  const sTitle = cleanQuery(title);
  const sArtist = cleanQuery(artist);
  if (!sTitle) return null;

  const engines: Array<() => Promise<ResolvedLosslessTrack | null>> = [];

  if (config.priority === 'qobuz') {
    engines.push(
      () => resolveQobuz(config.apiBase, sTitle, sArtist, durationSec),
      () => resolveTidal(config.apiBase, sTitle, sArtist, durationSec),
      () => resolveJioSaavn(sTitle, sArtist, durationSec),
    );
  } else if (config.priority === 'tidal') {
    engines.push(
      () => resolveTidal(config.apiBase, sTitle, sArtist, durationSec),
      () => resolveQobuz(config.apiBase, sTitle, sArtist, durationSec),
      () => resolveJioSaavn(sTitle, sArtist, durationSec),
    );
  } else {
    engines.push(
      () => resolveJioSaavn(sTitle, sArtist, durationSec),
      () => resolveQobuz(config.apiBase, sTitle, sArtist, durationSec),
      () => resolveTidal(config.apiBase, sTitle, sArtist, durationSec),
    );
  }

  for (const queryEngine of engines) {
    try {
      const match = await queryEngine();
      if (match?.url) {
        trackLog.i(`ClashFLAC resolved high quality stream from ${match.sourceName}: ${match.format}`);
        return match;
      }
    } catch {
      // Continue to next engine in priority chain
    }
  }

  return null;
}

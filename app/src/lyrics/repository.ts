import { withBackgroundVocals, type LyricLine } from './model';
import { lyricsGet } from './http';
import type { Parsed } from './parse';
import * as providers from './providers';
import { enabledSources, useLyricsSettings } from './settings';
import { artistForLyricsSearch, forLyricsSearch, sourceById, type LyricsSourceId } from './sources';
import { autoEnrichLyrics } from './translate';
import { writeTtml } from './ttml';

/**
 * Where the player gets its lyrics: a port of LyricsRepository.kt.
 *
 * - Every enabled source is asked at the same time, but their answers are
 *   taken in priority order: a lower source finishing first never preempts a
 *   higher one still pending.
 * - A word-timed answer wins outright. Otherwise the highest-priority timed
 *   answer is taken, unless "prefer syllable timing" is on, in which case
 *   the search carries on for a word-timed one and the line-timed answer is
 *   kept as a fallback.
 * - Before anyone is asked, BiniLyrics names the recording (an ISRC, in at
 *   most 2.5 s), so lrc.red and LyricsPlus can ask by recording, not name.
 * - Genius (a scraper) is only asked once every source above it has missed.
 */

export interface LyricsTrack {
  videoId: string;
  title: string;
  artist: string;
  durationMs: number;
  album: string | null;
}

export interface LyricsResult {
  source: LyricsSourceId;
  label: string;
  lines: LyricLine[];
  /** What am-lyrics renders: the provider's own TTML, or ours written from the lines. */
  ttml: string;
  wordSynced: boolean;
  synced: boolean;
}

/** One provider's part in a lookup, for the provider picker. */
export type SourceState = 'pending' | 'found' | 'missing';

const IDENTIFY_TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 12 * 60 * 60_000;

/** The recording behind a video id, once something worked it out (bounded, memory only). */
const isrcs = new Map<string, string>();
function remember(videoId: string, isrc: string | null | undefined) {
  if (!isrc || !videoId) return;
  isrcs.delete(videoId);
  isrcs.set(videoId, isrc);
  if (isrcs.size > 100) isrcs.delete(isrcs.keys().next().value!);
}

const cache = new Map<string, { at: number; result: LyricsResult | null }>();

/** Drops every remembered answer: a newly allowed host may have what was missing. */
export function forgetLyrics() {
  cache.clear();
}

function toResult(source: LyricsSourceId, parsed: Parsed): LyricsResult {
  const lines = withBackgroundVocals(parsed.lines);
  return {
    source,
    label: sourceById(source)?.label ?? source,
    lines,
    ttml: parsed.ttml ?? writeTtml(lines),
    wordSynced: lines.some((l) => l.words.length),
    synced: lines.some((l) => l.timeMs > 0 || l.words.length),
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))]);
}

export interface LookupOptions {
  /** Ask this one provider only: the panel's provider picker. */
  only?: LyricsSourceId;
  onSource?: (source: LyricsSourceId, state: SourceState) => void;
}

export async function lookupLyrics(track: LyricsTrack, { only, onSource }: LookupOptions = {}): Promise<LyricsResult | null> {
  const sequence = only ? [only] : enabledSources();
  if (!sequence.length) return null;
  const { paxsenixKey, preferSyllables } = useLyricsSettings.getState();
  // preferSyllables picks a different winner from the same answers, so it is part of the key.
  const key = `${track.videoId}|${track.durationMs}|${track.title}|${track.artist}|${only ?? ''}|${sequence.join(',')}|${preferSyllables}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.result;

  const query: providers.LyricsQuery = {
    videoId: track.videoId,
    title: forLyricsSearch(track.title),
    artist: artistForLyricsSearch(track.artist),
    durationMs: track.durationMs,
    album: track.album,
    isrc: isrcs.get(track.videoId) ?? null,
  };
  let hit: providers.BiniHit | null = null;
  if (!query.isrc && sequence.includes('bini')) {
    hit = await withTimeout(providers.biniIdentify(query).catch(() => null), IDENTIFY_TIMEOUT_MS);
    if (hit?.isrc) {
      remember(track.videoId, hit.isrc);
      query.isrc = hit.isrc;
    }
  }

  const documents = new Map<string, Promise<string | null>>();
  const get: providers.SharedGet = (url) => {
    let pending = documents.get(url);
    if (!pending) {
      pending = lyricsGet(url);
      documents.set(url, pending);
    }
    return pending;
  };

  const fetchFrom = (source: LyricsSourceId): Promise<Parsed | null> => {
    switch (source) {
      case 'netease':
        return providers.netEase(query);
      case 'qq-music':
        return providers.qqMusic(query);
      case 'lrc-red':
        return providers.lrcRed(query, get);
      case 'bini':
        return providers.bini(query, get, hit).then((found) => {
          remember(track.videoId, found?.isrc);
          return found;
        });
      case 'better-lyrics':
        return providers.betterLyrics(query);
      case 'better-lyrics-portato':
        return providers.betterLyricsPortato(query);
      case 'paxsenix':
        return providers.paxSenix(query);
      case 'paxsenix-spotify':
        return providers.paxSenixSpotify(query, paxsenixKey);
      case 'paxsenix-musixmatch':
        return providers.paxSenixMusixmatch(query, paxsenixKey);
      case 'lyrics-plus':
        return providers.lyricsPlus(query);
      case 'unison':
        return providers.unison(query);
      case 'lyrica':
        return providers.lyrica(query);
      case 'youtube-captions':
        return providers.youtubeCaptions(query);
      case 'youtube-music':
        return providers.youtubeMusicLyrics(query);
      case 'kugou':
        return providers.kugou(query);
      case 'lrclib':
        return providers.lrclib(query);
      case 'musixmatch':
        return providers.musixmatch(query);
      case 'genius':
        return providers.genius(query);
      case 'embedded':
        return Promise.resolve(null);
    }
  };

  // 5-second strict timeout: if a provider loads for > 5 seconds, change to another API
  const run = (source: LyricsSourceId): Promise<LyricsResult | null> => {
    onSource?.(source, 'pending');
    return withTimeout(fetchFrom(source), 5000)
      .catch(() => null)
      .then((parsed) => {
        const result = parsed?.lines.some((l) => l.text.trim()) ? toResult(source, parsed) : null;
        onSource?.(source, result ? 'found' : 'missing');
        return result;
      });
  };

  // Rule: "If only got one lyric api, stay on that"
  if (sequence.length === 1) {
    let single = await run(sequence[0]!);
    if (single && single.lines.length) {
      const current = single;
      const enriched = await autoEnrichLyrics(current.lines).catch(() => current.lines);
      single = {
        ...current,
        lines: enriched,
        ttml: writeTtml(enriched),
      };
    }
    cache.set(key, { at: Date.now(), result: single });
    return single;
  }

  // Check whether a result has Romanization or Translation
  const hasRomanOrTrans = (r: LyricsResult | null) =>
    Boolean(
      r &&
        r.lines.some(
          (l) =>
            (l.romanized && l.romanized.trim().length > 0) ||
            (l.translation && l.translation.trim().length > 0),
        ),
    );

  let bestRichSynced: LyricsResult | null = null; // Synced + (Romanized or Translated)
  let bestWordSynced: LyricsResult | null = null; // Syllable/word synced
  let firstSynced: LyricsResult | null = null; // First synced in priority order
  const plainCandidates: LyricsResult[] = []; // Plain lyrics for random fallback

  for (const source of sequence) {
    if (source === 'genius' && (bestRichSynced || bestWordSynced || firstSynced)) continue;

    const found = await run(source);
    if (!found) continue;

    if (found.synced) {
      if (!firstSynced) firstSynced = found;
      // 1. Highest priority: choose lyric that got romanize and translation
      if (hasRomanOrTrans(found)) {
        bestRichSynced = found;
        break; // Immediate top pick! Stop and return this rich result!
      }

      if (found.wordSynced && !bestWordSynced) {
        bestWordSynced = found;
        if (preferSyllables) break;
      }
    } else {
      plainCandidates.push(found);
    }
  }

  // Winner selection hierarchy:
  // 1. Synced with romanization and/or translation
  // 2. Word-synced (if preferSyllables) or first synced in priority order
  // 3. Random choice among plain lyric providers
  let winner: LyricsResult | null =
    bestRichSynced ??
    (preferSyllables ? (bestWordSynced ?? firstSynced) : firstSynced);

  if (!winner && plainCandidates.length > 0) {
    // "if not, choose random lyric api that got plain lyric"
    const randomIndex = Math.floor(Math.random() * plainCandidates.length);
    winner = plainCandidates[randomIndex] ?? plainCandidates[0]!;
  }

  if (winner && winner.lines.length) {
    const current = winner;
    const enriched = await autoEnrichLyrics(current.lines).catch(() => current.lines);
    winner = {
      ...current,
      lines: enriched,
      ttml: writeTtml(enriched),
    };
  }

  cache.set(key, { at: Date.now(), result: winner });
  return winner;
}

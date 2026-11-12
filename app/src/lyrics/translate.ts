import type { LyricLine } from './model';

interface TranslationResult {
  translations: string[];
  detectedLang?: string;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Batched translation using Google's dict-chrome-ex endpoint (unthrottled, fast JSON, no CAPTCHA).
 * Falls back to MyMemory API if unreachable.
 */
async function fetchBatchTranslation(texts: string[], targetLang = 'en'): Promise<TranslationResult> {
  if (!texts.length) return { translations: [] };

  const joined = texts.join('\n');
  const url = `https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto&tl=${encodeURIComponent(
    targetLang,
  )}&q=${encodeURIComponent(joined)}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });

    if (res.ok) {
      const data = (await res.json()) as [string, string][];
      if (Array.isArray(data) && data[0] && typeof data[0][0] === 'string') {
        const fullTranslation = data[0][0];
        const detectedLang = data[0][1];
        const translatedLines = fullTranslation.split(/\r?\n/);
        return {
          translations: texts.map((t, i) => translatedLines[i] ?? t),
          detectedLang,
        };
      }
    }
  } catch (err) {
    console.warn('[translate] Google clients5 failed, trying fallback:', err);
  }

  // Fallback: MyMemory API for smaller chunks or individual lines
  try {
    const fallbackResults = await Promise.all(
      texts.map(async (text) => {
        if (!text.trim()) return '';
        const mmUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${encodeURIComponent(targetLang)}`;
        const mmRes = await fetch(mmUrl);
        if (mmRes.ok) {
          const mmData = (await mmRes.json()) as { responseData?: { translatedText?: string } };
          if (mmData?.responseData?.translatedText) {
            return mmData.responseData.translatedText.trim();
          }
        }
        return text;
      }),
    );
    return { translations: fallbackResults };
  } catch (fallbackErr) {
    console.warn('[translate] Fallback also failed:', fallbackErr);
    return { translations: texts };
  }
}

/**
 * Automatically translates non-English lyric lines to the target language (default: 'en').
 * Preserves pre-existing line translations (e.g. from NetEase, QQ Music, or Lyrica).
 */
export async function autoTranslateLyrics(
  lines: LyricLine[],
  targetLang = 'en',
): Promise<LyricLine[]> {
  if (!lines.length) return lines;

  // If every lyric line already has a translation, no work needed
  const needsTranslation = lines.some((l) => !l.translation && l.text.trim());
  if (!needsTranslation) return lines;

  // Extract non-empty lines needing translation
  const indicesToTranslate: number[] = [];
  const textsToTranslate: string[] = [];

  lines.forEach((l, idx) => {
    if (!l.translation && l.text.trim()) {
      indicesToTranslate.push(idx);
      textsToTranslate.push(l.text.trim());
    }
  });

  if (!textsToTranslate.length) return lines;

  // Chunk batches to ~1200 characters to stay well within query URL limits
  const BATCH_CHAR_LIMIT = 1200;
  const batches: { indices: number[]; texts: string[] }[] = [];
  let currentBatch: { indices: number[]; texts: string[] } = { indices: [], texts: [] };
  let currentLength = 0;

  for (let i = 0; i < textsToTranslate.length; i++) {
    const text = textsToTranslate[i]!;
    const idx = indicesToTranslate[i]!;
    if (currentLength + text.length > BATCH_CHAR_LIMIT && currentBatch.texts.length > 0) {
      batches.push(currentBatch);
      currentBatch = { indices: [], texts: [] };
      currentLength = 0;
    }
    currentBatch.indices.push(idx);
    currentBatch.texts.push(text);
    currentLength += text.length + 1;
  }
  if (currentBatch.texts.length > 0) {
    batches.push(currentBatch);
  }

  const resultMap = new Map<number, string>();

  for (const batch of batches) {
    const { translations, detectedLang } = await fetchBatchTranslation(batch.texts, targetLang);
    // If detected source language is already English, do not assign redundant translations
    if (detectedLang === 'en' && targetLang === 'en') {
      continue;
    }

    batch.indices.forEach((origIdx, bIdx) => {
      const trans = translations[bIdx]?.trim();
      const origText = lines[origIdx]?.text.trim();
      // Only set if translation is non-empty and not identical to original line
      if (trans && origText && trans.toLowerCase() !== origText.toLowerCase()) {
        resultMap.set(origIdx, trans);
      }
    });
  }

  if (resultMap.size === 0) return lines;

  return lines.map((l, idx) => {
    const translation = l.translation || resultMap.get(idx);
    return translation ? { ...l, translation } : l;
  });
}

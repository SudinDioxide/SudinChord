import { useEffect, useState } from 'react';

export interface ArtworkAccent {
  primary: string;       // e.g. "rgb(255, 200, 40)"
  secondary: string;     // e.g. "rgb(255, 140, 30)"
  glow: string;          // e.g. "rgba(255, 200, 40, 0.55)"
  baseAlpha: string;     // e.g. "rgba(255, 200, 40, 0.18)"
  darkBg: string;        // e.g. "rgba(255, 200, 40, 0.08)"
}

export const DEFAULT_ACCENT: ArtworkAccent = {
  primary: '#ff0033',
  secondary: '#ff2a5f',
  glow: 'rgba(255, 0, 51, 0.55)',
  baseAlpha: 'rgba(255, 0, 51, 0.18)',
  darkBg: 'rgba(255, 0, 51, 0.08)',
};

const cache = new Map<string, ArtworkAccent>();

export async function extractArtworkAccent(url: string): Promise<ArtworkAccent> {
  const cached = cache.get(url);
  if (cached) return cached;

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 16;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(DEFAULT_ACCENT);
        ctx.drawImage(img, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;

        let bestScore = -1;
        let bestR = 255, bestG = 0, bestB = 51;
        let secondR = 255, secondG = 42, secondB = 95;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]!;
          const g = data[i + 1]!;
          const b = data[i + 2]!;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
          // Look for vibrant, rich tones (avoid pure blacks and washed whites)
          if (lum < 0.12 || lum > 0.94) continue;
          const score = sat * 1.7 + (1 - Math.abs(lum - 0.52));
          if (score > bestScore) {
            secondR = bestR;
            secondG = bestG;
            secondB = bestB;
            bestScore = score;
            bestR = r;
            bestG = g;
            bestB = b;
          }
        }

        const res: ArtworkAccent = {
          primary: `rgb(${bestR}, ${bestG}, ${bestB})`,
          secondary: `rgb(${secondR}, ${secondG}, ${secondB})`,
          glow: `rgba(${bestR}, ${bestG}, ${bestB}, 0.55)`,
          baseAlpha: `rgba(${bestR}, ${bestG}, ${bestB}, 0.20)`,
          darkBg: `rgba(${bestR}, ${bestG}, ${bestB}, 0.08)`,
        };
        cache.set(url, res);
        resolve(res);
      } catch {
        resolve(DEFAULT_ACCENT);
      }
    };
    img.onerror = () => resolve(DEFAULT_ACCENT);
    img.src = url;
  });
}

export function useArtworkAccent(url: string | null | undefined): ArtworkAccent {
  const [accent, setAccent] = useState<ArtworkAccent>(() => (url ? cache.get(url) ?? DEFAULT_ACCENT : DEFAULT_ACCENT));

  useEffect(() => {
    if (!url) {
      setAccent(DEFAULT_ACCENT);
      return;
    }
    const cached = cache.get(url);
    if (cached) {
      setAccent(cached);
      return;
    }
    let live = true;
    extractArtworkAccent(url).then((res) => {
      if (live) setAccent(res);
    });
    return () => {
      live = false;
    };
  }, [url]);

  return accent;
}


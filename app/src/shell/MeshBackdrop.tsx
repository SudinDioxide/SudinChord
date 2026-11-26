import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { meshPalette, type Rgb } from '@/lib/meshPalette';
import { getAudioAnalyser } from '@/state/player';
import {
  createGr4dientRenderer,
  extractGr4dientColors,
  mixOklab,
  type Gr4dientMode,
  type Oklab,
  srgbToOklab,
} from '@/lib/gr4dient';

const backdrop =
  'absolute inset-0 -z-1 overflow-hidden bg-[#121216] data-fallback:after:absolute data-fallback:after:inset-0 data-fallback:after:bg-grain data-fallback:after:opacity-6';

const FRAME_MS = 1000 / 30;
const FADE_MS = 1200;

/** Default neutral dark Oklab colors before artwork is read or if unreadable. */
const FALLBACK_OKLAB: Oklab[] = [
  srgbToOklab(22, 22, 28),
  srgbToOklab(45, 35, 55),
  srgbToOklab(30, 45, 60),
  srgbToOklab(55, 30, 45),
  srgbToOklab(18, 18, 22),
];

const reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      reducedMotion?.addEventListener('change', onChange);
      return () => reducedMotion?.removeEventListener('change', onChange);
    },
    () => reducedMotion?.matches ?? false,
  );
}

export function useGr4dientMode(): [Gr4dientMode, (mode: Gr4dientMode) => void] {
  const [mode, setMode] = useState<Gr4dientMode>(() => {
    try {
      const saved = localStorage.getItem('sudinchord.gr4dient.mode');
      if (saved !== null) {
        const val = parseInt(saved, 10);
        if (val >= 0 && val <= 3) return val as Gr4dientMode;
      }
    } catch {}
    return 0; // Default: Field
  });

  const updateMode = (next: Gr4dientMode) => {
    setMode(next);
    try {
      localStorage.setItem('sudinchord.gr4dient.mode', String(next));
      window.dispatchEvent(new CustomEvent('sudinchord:gr4dient-mode', { detail: next }));
    } catch {}
  };

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (typeof detail === 'number' && detail >= 0 && detail <= 3) {
        setMode(detail as Gr4dientMode);
      }
    };
    window.addEventListener('sudinchord:gr4dient-mode', handler);
    return () => window.removeEventListener('sudinchord:gr4dient-mode', handler);
  }, []);

  return [mode, updateMode];
}

/** 2D Canvas fallback if WebGL is unavailable on low-end hardware. */
const SMALL_WIDTH = 64;
const SMALL_HEIGHT = 40;
const cssRgb = ([r, g, b]: Rgb, a: number) => `rgb(${r | 0} ${g | 0} ${b | 0} / ${a})`;

function fallbackRenderer(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) return null;
  canvas.width = SMALL_WIDTH;
  canvas.height = SMALL_HEIGHT;
  return {
    draw(seconds: number) {
      context.fillStyle = '#141418';
      context.fillRect(0, 0, SMALL_WIDTH, SMALL_HEIGHT);
      const cx = SMALL_WIDTH / 2;
      const cy = SMALL_HEIGHT / 2;
      const rad = context.createRadialGradient(
        cx + Math.sin(seconds * 0.4) * 15,
        cy + Math.cos(seconds * 0.3) * 10,
        2,
        cx,
        cy,
        SMALL_WIDTH * 0.6,
      );
      rad.addColorStop(0, 'rgba(80, 60, 100, 0.6)');
      rad.addColorStop(0.6, 'rgba(40, 50, 70, 0.3)');
      rad.addColorStop(1, 'rgba(20, 20, 24, 0.9)');
      context.fillStyle = rad;
      context.fillRect(0, 0, SMALL_WIDTH, SMALL_HEIGHT);
    },
    dispose() {},
  };
}

/**
 * Animated Beat-Synchronized Gradient Backdrop (gr4dient)
 * - 4 Modes: Field (Mesh), Current (Flow), Fold (Silk), Beam (Rays)
 * - Blended in Oklab color space for vibrant non-muddy transitions
 * - Loops exactly on the beat: loopSec = (bars * 240) / bpm
 */
export function MeshBackdrop({
  artworkUrl,
  playing,
  bpm,
  mode: propMode,
}: {
  artworkUrl: string | null;
  playing: boolean;
  bpm?: number | null;
  mode?: Gr4dientMode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const still = useReducedMotion();
  const animate = playing && !still;
  const [globalMode] = useGr4dientMode();
  const activeMode = propMode !== undefined ? propMode : globalMode;

  const [generation, setGeneration] = useState(0);
  const [fallback, setFallback] = useState(false);

  // Animation and color state held outside React
  const state = useRef({
    from: FALLBACK_OKLAB,
    to: FALLBACK_OKLAB,
    fadeStart: -Infinity,
    seconds: 0,
    wake: () => {},
  });

  useEffect(() => {
    if (!artworkUrl) return;
    let live = true;
    meshPalette(artworkUrl)
      .then((cells) => {
        if (!live) return;
        const oklabColors = extractGr4dientColors(cells);
        const s = state.current;
        const now = performance.now();
        const fade = Math.min(1, (now - s.fadeStart) / FADE_MS);
        s.from =
          s.fadeStart === -Infinity
            ? oklabColors
            : s.from.map((c, i) => mixOklab(c, s.to[i] ?? c, fade));
        s.to = oklabColors;
        s.fadeStart = now;
        s.wake();
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [artworkUrl]);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;

    const gr4dient = fallback ? null : createGr4dientRenderer(el);
    const fallbackCanvas = fallback || !gr4dient ? fallbackRenderer(el) : null;

    if (!gr4dient && !fallbackCanvas) {
      if (!fallback) setFallback(true);
      return;
    }

    const s = state.current;
    let frame = 0;
    let last = performance.now();
    let drawn = -Infinity;

    // Loop duration based on real tempo (4 bars = 16 beats = bars * 240 / bpm)
    const tempo = bpm && bpm >= 40 && bpm <= 260 ? bpm : 120;
    const loopSec = (4 * 240) / tempo;

    // Audio spectrum data buffers and beat detector variables
    const freqData = new Uint8Array(64);
    let runningBassAvg = 0.2;
    let beatHit = 0;

    const tick = (now: number) => {
      frame = 0;
      const dt = Math.min(now - last, 100) / 1000;
      last = now;

      // Read real-time audio dynamics from Web Audio AnalyserNode
      const analyser = getAudioAnalyser();
      let bassEnergy = 0;
      let midEnergy = 0;
      let trebleEnergy = 0;

      if (analyser && animate) {
        analyser.getByteFrequencyData(freqData);

        // 1. Sub-bass & kick drum: bins 0 to 6 (~20 Hz - 140 Hz)
        let bassSum = 0;
        for (let i = 0; i < 7; i++) {
          bassSum += freqData[i]!;
        }
        const rawBass = bassSum / (7 * 255);
        bassEnergy = Math.min(1.0, Math.pow(rawBass, 0.78) * 1.35);

        // 2. Mid frequencies: bins 10 to 35 (~250 Hz - 1 kHz)
        let midSum = 0;
        for (let i = 10; i < 35; i++) {
          midSum += freqData[i]!;
        }
        const rawMid = midSum / (25 * 255);
        midEnergy = Math.min(1.0, Math.pow(rawMid, 0.82) * 1.35);

        // 3. Treble & presence: bins 36 to 58 (~1.5 kHz - 8 kHz)
        let trebleSum = 0;
        for (let i = 36; i < 58; i++) {
          trebleSum += freqData[i]!;
        }
        const rawTreble = trebleSum / (22 * 255);
        trebleEnergy = Math.min(1.0, Math.pow(rawTreble, 0.82) * 1.35);

        // Highly-sensitive transient beat detection (sub-bass kick drum strike)
        runningBassAvg = runningBassAvg * 0.92 + bassEnergy * 0.08;
        if (bassEnergy > runningBassAvg * 1.10 && bassEnergy > 0.08) {
          const delta = (bassEnergy - runningBassAvg) * 5.2;
          beatHit = Math.max(beatHit, Math.min(1.0, delta));
        }
      }

      // Smooth crisp decay of beat hit impulse
      beatHit *= 0.86;

      if (animate) {
        // Musical momentum: fluid surges with kicks and energetic dynamic sections
        const momentum = 1.0 + bassEnergy * 0.95 + beatHit * 0.75;
        s.seconds += dt * momentum;
      }

      const fade = Math.min(1, (now - s.fadeStart) / FADE_MS);
      if (now - drawn >= FRAME_MS - 1) {
        drawn = now;
        const currentColors =
          fade < 1
            ? s.from.map((c, i) => mixOklab(c, s.to[i] ?? c, 1 - (1 - fade) ** 3))
            : s.to;

        // Phase between 0.0 and 1.0 looping on musical downbeat
        const phase = still ? 0.0 : (s.seconds % loopSec) / loopSec;

        if (gr4dient) {
          gr4dient.render(currentColors, phase, activeMode, {
            bass: bassEnergy,
            mid: midEnergy,
            treble: trebleEnergy,
            beatHit,
          });
        } else if (fallbackCanvas) {
          fallbackCanvas.draw(s.seconds);
        }
      }
      if (animate || fade < 1) frame = requestAnimationFrame(tick);
    };

    s.wake = () => {
      if (!frame) {
        last = performance.now();
        frame = requestAnimationFrame(tick);
      }
    };

    const resized = new ResizeObserver(() => s.wake());
    resized.observe(el);

    const lost = (e: Event) => {
      e.preventDefault();
      setGeneration((g) => g + 1);
    };
    el.addEventListener('webglcontextlost', lost);
    s.wake();

    return () => {
      cancelAnimationFrame(frame);
      resized.disconnect();
      el.removeEventListener('webglcontextlost', lost);
      gr4dient?.dispose();
      fallbackCanvas?.dispose();
      s.wake = () => {};
    };
  }, [animate, generation, fallback, bpm, activeMode, still]);

  return (
    <div className={backdrop} aria-hidden="true" data-fallback={fallback || undefined}>
      <canvas key={`${generation}-${fallback}`} ref={canvas} className="absolute inset-0 size-full" />
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { getAudioAnalyser, usePlayer } from '@/state/player';
import { useArtworkAccent } from '@/lib/artworkAccent';
import { StereoDriftGradientEngine } from '@/lib/stereoDriftEngine';

/**
 * AmbientAppBackdrop with StereoDrift Audio-Reactive Gradient Engine.
 *
 * Implements the core backend and audio analysis logic from stereoDrift (stereoDrift.github.io):
 * - Real-time multi-band FFT audio analysis (sub-bass kick, mid melody, treble air).
 * - Perlin noise flow field that drives organic coordinate drift.
 * - Dynamic beat-reactive radial gradient stops that bloom and surge on kick drum strikes.
 * - Direct DOM manipulation via requestAnimationFrame for silky smooth 60fps performance with 0 React re-renders.
 * - Subtle film-grain dither texture for ultra-clean, unbanded color transitions.
 */
export function AmbientAppBackdrop() {
  const artworkUrl = usePlayer((s) => s.nowPlaying?.artworkUrl ?? null);
  const isPlaying = usePlayer((s) => s.status === 'playing');
  const accent = useArtworkAccent(artworkUrl);

  const layerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<StereoDriftGradientEngine>(new StereoDriftGradientEngine());

  useEffect(() => {
    if (!layerRef.current) return;
    const el = layerRef.current;
    const engine = engineRef.current;

    let animId: number;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      const analyser = getAudioAnalyser();

      const result = engine.update(analyser, isPlaying, dt, {
        primary: accent.glow || 'rgba(250, 35, 59, 0.55)',
        secondary: accent.secondary || 'rgba(168, 85, 247, 0.45)',
        accent: accent.primary || 'rgba(244, 63, 94, 0.5)',
        darkBg: accent.darkBg || 'rgba(15, 12, 28, 0.85)',
      });

      if (artworkUrl) {
        el.style.background = result.background;
        el.style.opacity = `${result.opacity}`;
        el.style.transform = `scale(${result.scale.toFixed(3)})`;
      } else {
        el.style.opacity = '0';
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, accent, artworkUrl]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
    >
      {/* StereoDrift Audio-Reactive Fluid Gradient Layer */}
      <div
        ref={layerRef}
        className="absolute -inset-[25%] blur-[115px] saturate-[1.65] will-change-[background,opacity,transform] transition-transform duration-100 ease-out"
        style={{
          opacity: artworkUrl ? (isPlaying ? 0.42 : 0.22) : 0,
        }}
      />

      {/* StereoDrift Subtle Film-Grain Dither Overlay (eliminates color banding) */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Bottom vignette to maintain crisp player bar contrast */}
      <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[var(--pageBG)] to-transparent opacity-85" />
    </div>
  );
}

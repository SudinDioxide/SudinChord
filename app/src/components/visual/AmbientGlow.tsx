import { useEffect, useMemo, useRef } from 'react';
import { getAudioAnalyser, usePlayer } from '@/state/player';
import type { ArtworkAccent } from '@/lib/artworkAccent';

/**
 * Calculates a high-contrast split-complementary color pair from the background accent.
 * Shifts hue by +140° and +220° with boosted saturation to guarantee sharp visual
 * separation from the background mesh gradient.
 */
function getContrastingAccents(colorStr: string) {
  let r = 250, g = 35, b = 59;
  const rgbMatch = colorStr.match(/\d+/g);
  if (rgbMatch && rgbMatch.length >= 3) {
    r = parseInt(rgbMatch[0]!, 10);
    g = parseInt(rgbMatch[1]!, 10);
    b = parseInt(rgbMatch[2]!, 10);
  } else if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1);
    if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
  }

  // Convert to HSL
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }

  // Split-Complementary / Triadic shift: guaranteed chromatic contrast against background mesh
  const hueA = Math.round((h + 140) % 360);
  const hueB = Math.round((h + 220) % 360);
  const sat = Math.max(88, Math.round(s * 100)); // Vivid saturation for glowing neon visibility
  const light = 58; // Luminous tone

  return {
    cornerA: `hsl(${hueA}, ${sat}%, ${light}%)`,
    cornerB: `hsl(${hueB}, ${sat}%, ${light}%)`,
    glowA: `hsla(${hueA}, ${sat}%, ${light}%, 0.65)`,
    glowB: `hsla(${hueB}, ${sat}%, ${light}%, 0.65)`,
  };
}

export function AmbientGlow({ accent, enabled = true }: { accent?: ArtworkAccent | null; enabled?: boolean }) {
  const isPlaying = usePlayer((s) => s.status === 'playing');
  const glowRef = useRef<HTMLDivElement>(null);
  const cornersRef = useRef<HTMLDivElement>(null);
  const sidesRef = useRef<HTMLDivElement>(null);

  const baseColor = accent?.primary ?? '#fa233b';
  const contrasts = useMemo(() => getContrastingAccents(baseColor), [baseColor]);

  useEffect(() => {
    if (!enabled) return;
    const analyser = getAudioAnalyser();
    if (!analyser) return;

    let animId: number;
    const timeData = new Uint8Array(64);
    const freqData = new Uint8Array(64);

    let smoothWave = 0;
    let smoothBass = 0;

    const tick = () => {
      if (!isPlaying) {
        if (glowRef.current) {
          glowRef.current.style.opacity = '0.22';
          glowRef.current.style.transform = 'scale(1)';
        }
        if (cornersRef.current) {
          cornersRef.current.style.opacity = '0.28';
          cornersRef.current.style.transform = 'scale(1)';
        }
        if (sidesRef.current) {
          sidesRef.current.style.opacity = '0.18';
          sidesRef.current.style.transform = 'scale(1)';
        }
        return;
      }

      // 1. Instantaneous audio waveform data (oscilloscope amplitude)
      analyser.getByteTimeDomainData(timeData);
      let wavePeak = 0;
      let waveSum = 0;
      for (let i = 0; i < 64; i++) {
        const dev = Math.abs(timeData[i]! - 128) / 128; // 0.0 to 1.0 real-time waveform oscillation
        if (dev > wavePeak) wavePeak = dev;
        waveSum += dev;
      }
      const rawWave = wavePeak * 0.75 + (waveSum / 64) * 0.45;

      // 2. Frequency spectrum (kick sub-bass & impact)
      analyser.getByteFrequencyData(freqData);
      let bassSum = 0;
      for (let i = 0; i < 7; i++) {
        bassSum += freqData[i]!;
      }
      const rawBass = bassSum / (7 * 255);

      // High-sensitivity perceptual audio scaling
      const instantWave = Math.min(1.0, Math.pow(rawWave, 0.72) * 1.6);
      const instantBass = Math.min(1.0, Math.pow(rawBass, 0.75) * 1.4);

      // Fast-attack, smooth-decay physics
      smoothWave = Math.max(instantWave, smoothWave * 0.84);
      smoothBass = Math.max(instantBass, smoothBass * 0.88);

      const targetOpacity = Math.min(1.0, 0.48 + smoothWave * 0.46 + smoothBass * 0.22).toFixed(2);
      const cornerScale = (1.0 + smoothWave * 0.09 + smoothBass * 0.06).toFixed(3);
      const sideScale = (1.0 + smoothWave * 0.07).toFixed(3);

      if (glowRef.current) {
        glowRef.current.style.opacity = targetOpacity;
      }
      if (cornersRef.current) {
        cornersRef.current.style.opacity = targetOpacity;
        cornersRef.current.style.transform = `scale(${cornerScale})`;
      }
      if (sidesRef.current) {
        sidesRef.current.style.opacity = (parseFloat(targetOpacity) * 0.90).toFixed(2);
        sidesRef.current.style.transform = `scale(${sideScale})`;
      }

      animId = requestAnimationFrame(tick);
    };

    tick();
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, enabled]);

  if (!enabled) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none" aria-hidden="true">
      {/* 4 Dynamic Contrasting Corner Waveform Flares */}
      <div
        ref={cornersRef}
        className="absolute inset-0 size-full transition-transform duration-75 ease-out will-change-[opacity,transform]"
        style={{
          background: `
            radial-gradient(circle 50vw at 0% 0%, ${contrasts.glowA} 0%, ${contrasts.cornerA} 26%, transparent 72%),
            radial-gradient(circle 50vw at 100% 0%, ${contrasts.glowB} 0%, ${contrasts.cornerB} 26%, transparent 72%),
            radial-gradient(circle 50vw at 0% 100%, ${contrasts.glowB} 0%, ${contrasts.cornerB} 26%, transparent 72%),
            radial-gradient(circle 50vw at 100% 100%, ${contrasts.glowA} 0%, ${contrasts.cornerA} 26%, transparent 72%)
          `,
          opacity: isPlaying ? 0.55 : 0.25,
          mixBlendMode: 'screen',
        }}
      />

      {/* Side Perimeter Waveform Gradients */}
      <div
        ref={sidesRef}
        className="absolute inset-0 size-full transition-transform duration-75 ease-out will-change-[opacity,transform]"
        style={{
          background: `
            linear-gradient(to right, ${contrasts.glowA} 0%, transparent 18%),
            linear-gradient(to left, ${contrasts.glowB} 0%, transparent 18%),
            linear-gradient(to bottom, ${contrasts.glowA} 0%, transparent 14%),
            linear-gradient(to top, ${contrasts.glowB} 0%, transparent 16%)
          `,
          opacity: isPlaying ? 0.50 : 0.20,
          mixBlendMode: 'screen',
        }}
      />

      {/* Deep Inset Perimeter Box Shadow */}
      <div
        ref={glowRef}
        className="absolute inset-0 size-full transition-opacity duration-100 ease-out will-change-[opacity]"
        style={{
          boxShadow: `inset 0 0 220px 45px ${contrasts.glowA}, inset 0 0 70px 20px ${contrasts.glowB}`,
          opacity: isPlaying ? 0.55 : 0.25,
        }}
      />
    </div>
  );
}

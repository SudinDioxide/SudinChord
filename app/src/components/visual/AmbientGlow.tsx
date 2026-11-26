import { useEffect, useRef } from 'react';
import { getAudioAnalyser, usePlayer } from '@/state/player';
import type { ArtworkAccent } from '@/lib/artworkAccent';

export function AmbientGlow({ accent, enabled = true }: { accent?: ArtworkAccent | null; enabled?: boolean }) {
  const isPlaying = usePlayer((s) => s.status === 'playing');
  const glowRef = useRef<HTMLDivElement>(null);
  const cornersRef = useRef<HTMLDivElement>(null);
  const sidesRef = useRef<HTMLDivElement>(null);

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
          glowRef.current.style.opacity = '0.2';
          glowRef.current.style.transform = 'scale(1)';
        }
        if (cornersRef.current) {
          cornersRef.current.style.opacity = '0.25';
          cornersRef.current.style.transform = 'scale(1)';
        }
        if (sidesRef.current) {
          sidesRef.current.style.opacity = '0.15';
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

      const targetOpacity = Math.min(1.0, 0.40 + smoothWave * 0.45 + smoothBass * 0.20).toFixed(2);
      const cornerScale = (1.0 + smoothWave * 0.08 + smoothBass * 0.06).toFixed(3);
      const sideScale = (1.0 + smoothWave * 0.06).toFixed(3);

      if (glowRef.current) {
        glowRef.current.style.opacity = targetOpacity;
      }
      if (cornersRef.current) {
        cornersRef.current.style.opacity = targetOpacity;
        cornersRef.current.style.transform = `scale(${cornerScale})`;
      }
      if (sidesRef.current) {
        sidesRef.current.style.opacity = (parseFloat(targetOpacity) * 0.85).toFixed(2);
        sidesRef.current.style.transform = `scale(${sideScale})`;
      }

      animId = requestAnimationFrame(tick);
    };

    tick();
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, enabled]);

  if (!enabled) return null;

  const color = accent?.primary ?? '#fa233b';
  const secondary = accent?.secondary ?? '#ff2a5f';
  const glowColor = accent?.glow ?? 'rgba(250, 35, 59, 0.55)';

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none" aria-hidden="true">
      {/* 4 Dynamic Corner Waveform Flares */}
      <div
        ref={cornersRef}
        className="absolute inset-0 size-full transition-transform duration-75 ease-out will-change-[opacity,transform]"
        style={{
          background: `
            radial-gradient(circle 45vw at 0% 0%, ${glowColor} 0%, ${color} 28%, transparent 70%),
            radial-gradient(circle 45vw at 100% 0%, ${glowColor} 0%, ${secondary} 28%, transparent 70%),
            radial-gradient(circle 45vw at 0% 100%, ${glowColor} 0%, ${secondary} 28%, transparent 70%),
            radial-gradient(circle 45vw at 100% 100%, ${glowColor} 0%, ${color} 28%, transparent 70%)
          `,
          opacity: isPlaying ? 0.45 : 0.2,
          mixBlendMode: 'screen',
        }}
      />

      {/* Side Perimeter Waveform Gradients */}
      <div
        ref={sidesRef}
        className="absolute inset-0 size-full transition-transform duration-75 ease-out will-change-[opacity,transform]"
        style={{
          background: `
            linear-gradient(to right, ${glowColor} 0%, transparent 16%),
            linear-gradient(to left, ${glowColor} 0%, transparent 16%),
            linear-gradient(to bottom, ${glowColor} 0%, transparent 12%),
            linear-gradient(to top, ${glowColor} 0%, transparent 15%)
          `,
          opacity: isPlaying ? 0.4 : 0.15,
          mixBlendMode: 'screen',
        }}
      />

      {/* Deep Inset Perimeter Box Shadow */}
      <div
        ref={glowRef}
        className="absolute inset-0 size-full transition-opacity duration-100 ease-out will-change-[opacity]"
        style={{
          boxShadow: `inset 0 0 200px 40px ${glowColor}, inset 0 0 60px 15px ${color}`,
          opacity: isPlaying ? 0.45 : 0.2,
        }}
      />
    </div>
  );
}

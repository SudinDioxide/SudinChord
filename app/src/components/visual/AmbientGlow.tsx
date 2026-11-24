import { useEffect, useRef } from 'react';
import { getAudioAnalyser, usePlayer } from '@/state/player';
import type { ArtworkAccent } from '@/lib/artworkAccent';

export function AmbientGlow({ accent, enabled = true }: { accent?: ArtworkAccent | null; enabled?: boolean }) {
  const isPlaying = usePlayer((s) => s.status === 'playing');
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!enabled || !glowRef.current) return;
    const el = glowRef.current;
    const analyser = getAudioAnalyser();
    if (!analyser) return;

    let animId: number;
    const freqData = new Uint8Array(32);

    const tick = () => {
      if (!isPlaying) {
        el.style.opacity = '0.15';
        el.style.transform = 'scale(1)';
        return;
      }

      analyser.getByteFrequencyData(freqData);
      // Sample low-bass kick energy (bins 0-3: 20-150 Hz)
      const b0 = freqData[0] ?? 0;
      const b1 = freqData[1] ?? 0;
      const b2 = freqData[2] ?? 0;
      const b3 = freqData[3] ?? 0;
      const bassEnergy = (b0 + b1 + b2 + b3) / (4 * 255);
      const targetOpacity = 0.25 + bassEnergy * 0.55;
      const targetScale = 1.0 + bassEnergy * 0.04;

      el.style.opacity = targetOpacity.toFixed(2);
      el.style.transform = `scale(${targetScale.toFixed(3)})`;

      animId = requestAnimationFrame(tick);
    };

    tick();
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, enabled]);

  if (!enabled) return null;

  const color = accent?.primary ?? '#fa233b';
  const glowColor = accent?.glow ?? 'rgba(250, 35, 59, 0.4)';

  return (
    <div
      ref={glowRef}
      className="pointer-events-none fixed inset-0 z-0 transition-all duration-100 ease-out will-change-[opacity,transform]"
      style={{
        boxShadow: `inset 0 0 120px 30px ${glowColor}, inset 0 0 40px 10px ${color}`,
        opacity: isPlaying ? 0.35 : 0.15,
      }}
      aria-hidden="true"
    />
  );
}

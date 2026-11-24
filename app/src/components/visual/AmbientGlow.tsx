import { useEffect, useRef } from 'react';
import { getAudioAnalyser, usePlayer } from '@/state/player';
import type { ArtworkAccent } from '@/lib/artworkAccent';
import { StereoDriftAnalyzer } from '@/lib/stereoDriftEngine';

export function AmbientGlow({ accent, enabled = true }: { accent?: ArtworkAccent | null; enabled?: boolean }) {
  const isPlaying = usePlayer((s) => s.status === 'playing');
  const glowRef = useRef<HTMLDivElement>(null);
  const analyzerRef = useRef<StereoDriftAnalyzer>(new StereoDriftAnalyzer());

  useEffect(() => {
    if (!enabled || !glowRef.current) return;
    const el = glowRef.current;
    const analyzer = analyzerRef.current;

    let animId: number;

    const tick = () => {
      const analyser = getAudioAnalyser();
      const dynamics = analyzer.analyze(analyser, isPlaying);

      if (!isPlaying) {
        el.style.opacity = '0.15';
        el.style.transform = 'scale(1)';
        return;
      }

      const targetOpacity = 0.22 + dynamics.bass * 0.45 + dynamics.beatHit * 0.28;
      const targetScale = 1.0 + dynamics.bass * 0.025 + dynamics.beatHit * 0.035;

      el.style.opacity = targetOpacity.toFixed(2);
      el.style.transform = `scale(${targetScale.toFixed(3)})`;

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
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

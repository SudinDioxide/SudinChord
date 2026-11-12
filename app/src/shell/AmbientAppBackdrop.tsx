import { useMemo } from 'react';
import { usePlayer } from '@/state/player';
import { useArtworkAccent } from '@/lib/artworkAccent';

export function AmbientAppBackdrop() {
  const artworkUrl = usePlayer((s) => s.nowPlaying?.artworkUrl ?? null);
  const isPlaying = usePlayer((s) => s.status === 'playing');
  const accent = useArtworkAccent(artworkUrl);

  const style = useMemo(() => {
    if (!artworkUrl) {
      return {
        opacity: 0,
      };
    }
    return {
      opacity: isPlaying ? 0.38 : 0.22,
      background: `
        radial-gradient(circle at 80% 20%, ${accent.glow} 0%, transparent 55%),
        radial-gradient(circle at 15% 80%, ${accent.secondary} 0%, transparent 50%),
        radial-gradient(circle at 50% 50%, ${accent.darkBg} 0%, transparent 65%)
      `,
    };
  }, [artworkUrl, isPlaying, accent]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden transition-opacity duration-1000 ease-in-out"
    >
      {/* Drifting aurora glow layer */}
      <div
        className="absolute -inset-[20%] blur-[110px] saturate-[1.6] will-change-transform animate-[aurora-drift_25s_ease-in-out_infinite_alternate]"
        style={style}
      />
      {/* Subtle bottom vignette to ensure player bar contrast remains sharp */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[var(--pageBG)] to-transparent opacity-80" />
    </div>
  );
}


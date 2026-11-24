import { Disc3 } from 'lucide-react';
import { sizedArtwork } from '@/lib/artwork';

interface VinylRecordProps {
  artworkUrl?: string | null;
  playing: boolean;
  className?: string;
  size?: number;
}

export function VinylRecord({ artworkUrl, playing, className, size }: VinylRecordProps) {
  const artSrc = artworkUrl ? sizedArtwork(artworkUrl, 300) : null;

  return (
    <div
      className={`relative select-none flex items-center justify-center transition-transform duration-500 ${className ?? ''}`}
      style={{
        width: size ? `${size}px` : '100%',
        aspectRatio: '1 / 1',
      }}
    >
      {/* Vinyl Disc Body with micro-grooves and dynamic light reflection */}
      <div
        className="relative size-full rounded-full shadow-[0_15px_35px_rgba(0,0,0,0.85),0_0_0_2px_rgba(255,255,255,0.06)] overflow-hidden flex items-center justify-center transition-all duration-700"
        style={{
          background: `
            radial-gradient(circle at center, transparent 36%, rgba(0,0,0,0.92) 37%),
            repeating-radial-gradient(circle at center, #111111 0px, #1a1a1a 1px, #0d0d0d 2px, #181818 3px),
            conic-gradient(from 0deg, rgba(255,255,255,0.14) 0deg, transparent 60deg, rgba(255,255,255,0.18) 120deg, transparent 180deg, rgba(255,255,255,0.14) 240deg, transparent 300deg, rgba(255,255,255,0.18) 360deg)
          `,
          animation: playing ? 'spin 1.8s linear infinite' : 'none',
        }}
      >
        {/* Subtle Conical Vinyl Sheen Highlight */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full opacity-60 mix-blend-overlay"
          style={{
            background: `conic-gradient(from 45deg, rgba(255,255,255,0.25) 0deg, transparent 40deg, transparent 140deg, rgba(255,255,255,0.25) 180deg, transparent 220deg, transparent 320deg, rgba(255,255,255,0.25) 360deg)`,
          }}
        />

        {/* Outer Run-in Groove */}
        <div className="pointer-events-none absolute inset-2 rounded-full border border-white/[0.04]" />
        <div className="pointer-events-none absolute inset-4 rounded-full border border-white/[0.03]" />
        <div className="pointer-events-none absolute inset-8 rounded-full border border-white/[0.02]" />

        {/* Center Circular Label (38% diameter) */}
        <div className="relative size-[38%] rounded-full overflow-hidden shadow-[0_0_12px_rgba(0,0,0,0.9),inset_0_0_4px_rgba(0,0,0,0.6)] flex items-center justify-center bg-black border border-white/20">
          {artSrc ? (
            <img
              src={artSrc}
              alt="Vinyl Label"
              className="size-full object-cover scale-110 pointer-events-none"
              decoding="async"
            />
          ) : (
            <Disc3 size={40} className="text-white/40" />
          )}

          {/* Center Spindle Hole */}
          <div className="absolute size-4 rounded-full bg-[#0a0a0d] border border-white/40 shadow-[inset_0_2px_4px_rgba(0,0,0,0.9)] flex items-center justify-center">
            <div className="size-1.5 rounded-full bg-black/80" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Animated Turntable Tonearm with stylus needle.
 * Pivots onto the record when playing, and lifts off to resting position when paused.
 */
export function Tonearm({ playing, className }: { playing: boolean; className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute -top-8 -right-4 w-28 h-48 transition-transform duration-700 ease-[cubic-bezier(0.2,1,0.3,1)] z-30 ${className ?? ''}`}
      style={{
        transformOrigin: 'top right',
        transform: playing ? 'rotate(24deg)' : 'rotate(0deg)',
      }}
    >
      {/* Pivot Base */}
      <div className="absolute top-2 right-2 size-8 rounded-full bg-gradient-to-b from-[#444] to-[#1a1a1a] border border-white/20 shadow-xl flex items-center justify-center">
        <div className="size-3 rounded-full bg-[#111] border border-white/30" />
      </div>

      {/* Arm Rod (Brushed Chrome) */}
      <div
        className="absolute top-7 right-5 w-1.5 h-36 bg-gradient-to-r from-[#d0d0d0] via-[#ffffff] to-[#a0a0a0] rounded-full shadow-lg"
        style={{
          transform: 'rotate(-4deg)',
          transformOrigin: 'top center',
        }}
      />

      {/* Cartridge & Stylus Head */}
      <div
        className="absolute bottom-5 right-7 w-4 h-7 bg-gradient-to-b from-[#222] to-[#111] border border-white/30 rounded-t-sm rounded-b-md shadow-2xl flex flex-col items-center justify-end pb-1"
        style={{
          transform: 'rotate(-10deg)',
        }}
      >
        {/* Needle tiny tip */}
        <div className="w-0.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
      </div>
    </div>
  );
}

import { Disc3 } from 'lucide-react';
import { sizedArtwork } from '@/lib/artwork';

interface VinylRecordProps {
  artworkUrl?: string | null;
  playing: boolean;
  className?: string;
  size?: number;
}

/**
 * High-Fidelity 33⅓ RPM Vinyl Record Component.
 * Styled after itsweliton's CodePen (MWMrxaw) with:
 * - 180g heavy-pressed vinyl disc with outer rim and edge bevel.
 * - Multi-layer concentric sound track grooves and spacing bands.
 * - Stationary dual-cone specular light sheen (room light reflection) with secondary cross-angle gloss.
 * - Smooth hardware-accelerated GPU 33⅓ RPM rotation (pauses & resumes seamlessly).
 * - Center album artwork label with vintage rim ring and bevel-highlighted spindle hole.
 */
export function VinylRecord({ artworkUrl, playing, className, size }: VinylRecordProps) {
  const artSrc = artworkUrl ? sizedArtwork(artworkUrl, 400) : null;

  return (
    <div
      className={`relative select-none flex items-center justify-center ${className ?? ''}`}
      style={{
        width: size ? `${size}px` : '100%',
        aspectRatio: '1 / 1',
      }}
    >
      {/* 1. Main Vinyl Record Body (Deep vinyl black with outer rim bevel & depth shadow) */}
      <div
        className="relative size-full rounded-full overflow-hidden flex items-center justify-center shadow-[0_15px_45px_rgba(0,0,0,0.85),0_0_0_2px_rgba(255,255,255,0.08),inset_0_0_0_4px_#0a0a0a]"
        style={{
          background: 'radial-gradient(circle at center, #0c0c0c 0%, #161616 55%, #050505 100%)',
        }}
      >
        {/* 2. Rotating Layer (Grooves, Track Separators, and Center Label) */}
        <div
          className="relative size-full rounded-full flex items-center justify-center will-change-transform"
          style={{
            animation: 'sudin-vinyl-spin 2.2s linear infinite',
            animationPlayState: playing ? 'running' : 'paused',
          }}
        >
          {/* Micro-Grooves and concentric sound tracks */}
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background: `
                /* Lead-out runout groove ring */
                radial-gradient(circle at center, transparent 0, transparent 20%, rgba(255,255,255,0.05) 21%, transparent 22%),
                /* Track gap spacer 1 */
                radial-gradient(circle at center, transparent 0, transparent 30%, rgba(255,255,255,0.07) 31%, transparent 32%),
                /* Track gap spacer 2 */
                radial-gradient(circle at center, transparent 0, transparent 40%, rgba(255,255,255,0.07) 41%, transparent 42%),
                /* Dense micro-grooves */
                repeating-radial-gradient(
                  circle at center,
                  transparent 0,
                  transparent 2px,
                  rgba(255, 255, 255, 0.04) 3px,
                  rgba(0, 0, 0, 0.5) 4px
                )
              `,
            }}
          />

          {/* Outer Run-in Groove & Inner Run-out (Dead Wax) */}
          <div className="pointer-events-none absolute inset-2 rounded-full border border-white/[0.08]" />
          <div className="pointer-events-none absolute inset-4 rounded-full border border-white/[0.04]" />
          <div className="pointer-events-none absolute inset-[36%] rounded-full border border-white/[0.06]" />

          {/* Center Record Label (35% diameter) */}
          <div className="relative size-[35%] rounded-full overflow-hidden shadow-[0_0_0_4px_#0c0c0c,0_0_0_6px_rgba(255,255,255,0.08),0_0_15px_rgba(0,0,0,0.85)] flex items-center justify-center bg-[#121216]">
            {artSrc ? (
              <img
                src={artSrc}
                alt="Vinyl Label"
                className="size-full object-cover scale-105 pointer-events-none"
                decoding="async"
              />
            ) : (
              <div className="size-full flex flex-col items-center justify-center bg-gradient-to-tr from-[#1b1c24] to-[#2a2b38] text-center p-2">
                <Disc3 size={32} className="text-white/40 mb-1" />
                <span className="text-[8px] font-mono tracking-widest uppercase text-white/60">SudinChord</span>
                <span className="text-[7px] font-mono text-white/40">33⅓ RPM</span>
              </div>
            )}

            {/* Label Rim Vintage Ring */}
            <div className="pointer-events-none absolute inset-1.5 rounded-full border border-white/25 opacity-70" />

            {/* Label Typography Badge (SIDE A / 33⅓ RPM) */}
            <div className="pointer-events-none absolute bottom-3 flex flex-col items-center opacity-90 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
              <span className="text-[7px] font-bold tracking-widest text-white/90">SIDE A</span>
              <span className="text-[6px] font-mono text-white/70">33⅓ RPM</span>
            </div>

            {/* Center Spindle Hole with metallic bevel highlights */}
            <div className="absolute size-5 rounded-full bg-[#080808] shadow-[inset_0_1px_2px_rgba(255,255,255,0.4),inset_0_-1px_2px_rgba(0,0,0,0.95),0_0_0_1px_#000] flex items-center justify-center z-10">
              <div className="size-1.5 rounded-full bg-black/90 shadow-inner" />
            </div>
          </div>
        </div>

        {/* 3. Stationary Specular Light Sheen (Room lighting reflection overlay) */}
        {/* Real-world vinyl reflection stays fixed to the room light while the disc rotates beneath! */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full mix-blend-screen opacity-90 z-20"
          style={{
            background: `
              conic-gradient(
                from 40deg,
                transparent 0deg,
                rgba(255, 255, 255, 0.18) 35deg,
                transparent 70deg,
                transparent 180deg,
                rgba(255, 255, 255, 0.18) 215deg,
                transparent 250deg
              )
            `,
          }}
        />

        {/* Secondary softer cross-angle reflection */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full mix-blend-screen opacity-70 z-20"
          style={{
            background: `
              conic-gradient(
                from 130deg,
                transparent 0deg,
                rgba(255, 255, 255, 0.10) 25deg,
                transparent 50deg,
                transparent 180deg,
                rgba(255, 255, 255, 0.10) 205deg,
                transparent 230deg
              )
            `,
          }}
        />
      </div>

      {/* Global CSS Keyframes for GPU-accelerated rotation */}
      <style>{`
        @keyframes sudin-vinyl-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}

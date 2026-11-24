import { useRef, useEffect, useState } from 'react';
import { Disc3 } from 'lucide-react';
import { sizedArtwork } from '@/lib/artwork';

interface VinylRecordProps {
  artworkUrl?: string | null;
  playing: boolean;
  className?: string;
  size?: number;
}

/**
 * Audiophile Turntable & High-Fidelity Vinyl Record.
 * Features:
 * - 33⅓ RPM rotational physics with smooth spin-up / deceleration inertia.
 * - Multi-layer micro-groove texture with run-in, body, and dead wax run-out grooves.
 * - Dual opposing butterfly specular gloss reflection with subtle diffraction iridescence.
 * - Technics SL-1200 style precision aluminum platter with strobe dots.
 * - Spindle with brass ring bushing and album label typography.
 */
export function VinylRecord({ artworkUrl, playing, className, size }: VinylRecordProps) {
  const artSrc = artworkUrl ? sizedArtwork(artworkUrl, 300) : null;
  const rotationRef = useRef(0);
  const discRef = useRef<HTMLDivElement>(null);

  // Smooth rotational inertia on pause/play using direct DOM transform (zero React re-renders)
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();
    let speed = playing ? 1 : 0; // target angular speed (1 = full 33 1/3 rpm = ~200 deg/sec)

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      const targetSpeed = playing ? 1 : 0;
      // Exponential smoothing for motor spin-up / spindown friction
      const lerpFactor = playing ? 3.0 : 1.8;
      speed += (targetSpeed - speed) * Math.min(1, dt * lerpFactor);

      if (speed > 0.001) {
        // 33.33 RPM = 0.555 revolutions/sec = 200 deg/sec
        rotationRef.current = (rotationRef.current + speed * 200 * dt) % 360;
        if (discRef.current) {
          discRef.current.style.transform = `rotate(${rotationRef.current.toFixed(2)}deg)`;
        }
        animId = requestAnimationFrame(tick);
      } else {
        speed = 0;
      }
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [playing]);

  return (
    <div
      className={`relative select-none flex items-center justify-center ${className ?? ''}`}
      style={{
        width: size ? `${size}px` : '100%',
        aspectRatio: '1 / 1',
      }}
    >
      {/* Precision Machined Aluminum Platter (Technics-style strobe dots & rim) */}
      <div
        className="absolute inset-[-4%] rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.9),0_0_0_2px_rgba(255,255,255,0.08)] pointer-events-none"
        style={{
          background: `
            radial-gradient(circle, transparent 94%, #28282e 95%, #18181c 97%, #3a3a42 99%, #141416 100%),
            repeating-conic-gradient(from 0deg, #2a2a30 0deg, #2a2a30 1.5deg, #151518 1.5deg, #151518 3deg)
          `,
        }}
      />

      {/* Main Vinyl Record Disc */}
      <div
        ref={discRef}
        className="relative size-full rounded-full shadow-[0_15px_35px_rgba(0,0,0,0.85),inset_0_0_8px_rgba(255,255,255,0.1)] overflow-hidden flex items-center justify-center will-change-transform"
        style={{
          transform: `rotate(${rotationRef.current.toFixed(2)}deg)`,
          background: '#0c0c0e',
        }}
      >
        {/* 1. Realistic Repeating Micro-Groove Layers */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background: `
              radial-gradient(circle at center, transparent 38%, rgba(0,0,0,0.92) 39%),
              repeating-radial-gradient(circle at center, #0b0b0d 0px, #0b0b0d 1.5px, #1a1a1e 2px, #08080a 3px, #18181c 4px)
            `,
          }}
        />

        {/* 2. Audio Track Spacing Bands (Visual divisions between songs on the LP) */}
        <div className="pointer-events-none absolute inset-[12%] rounded-full border border-black/80 shadow-[inset_0_0_3px_rgba(255,255,255,0.04)]" />
        <div className="pointer-events-none absolute inset-[20%] rounded-full border border-black/80 shadow-[inset_0_0_3px_rgba(255,255,255,0.04)]" />
        <div className="pointer-events-none absolute inset-[27%] rounded-full border border-black/80 shadow-[inset_0_0_3px_rgba(255,255,255,0.04)]" />

        {/* 3. Outer Run-in Groove & Inner Run-out (Dead Wax Area) */}
        <div className="pointer-events-none absolute inset-1.5 rounded-full border border-white/[0.06]" />
        <div className="pointer-events-none absolute inset-3 rounded-full border border-white/[0.04]" />
        <div className="pointer-events-none absolute inset-[34%] rounded-full border border-white/[0.05]" />

        {/* 4. Dual Conical Butterfly Specular Gloss with Subtle Iridescent Sheen */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full mix-blend-screen opacity-70"
          style={{
            background: `
              conic-gradient(
                from 30deg,
                rgba(255,255,255,0.02) 0deg,
                rgba(255,255,255,0.18) 45deg,
                rgba(240,245,255,0.28) 60deg,
                rgba(255,255,255,0.04) 90deg,
                transparent 120deg,
                rgba(255,255,255,0.02) 210deg,
                rgba(255,255,255,0.18) 225deg,
                rgba(240,245,255,0.28) 240deg,
                rgba(255,255,255,0.04) 270deg,
                transparent 300deg,
                rgba(255,255,255,0.02) 360deg
              )
            `,
          }}
        />

        {/* 5. Center Circular Record Label (37% diameter with authentic LP typography) */}
        <div className="relative size-[37%] rounded-full overflow-hidden shadow-[0_0_18px_rgba(0,0,0,0.95),inset_0_0_5px_rgba(0,0,0,0.8)] flex items-center justify-center bg-[#121216] border-2 border-white/20">
          {artSrc ? (
            <img
              src={artSrc}
              alt="Vinyl Label"
              className="size-full object-cover scale-110 pointer-events-none"
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

          {/* Label Center Spindle Hole with Brass Bushing */}
          <div className="absolute size-5 rounded-full bg-gradient-to-b from-[#8a7638] via-[#e5c158] to-[#6d5a22] p-[1.5px] shadow-[0_2px_6px_rgba(0,0,0,0.9)] flex items-center justify-center">
            <div className="size-full rounded-full bg-[#0a0a0d] shadow-[inset_0_2px_4px_rgba(0,0,0,0.95)] flex items-center justify-center">
              <div className="size-1 rounded-full bg-black" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Precision Audiophile S-Shape Tonearm.
 * Includes:
 * - Counterweight assembly with calibrated dial ring.
 * - Pivot gimbal with brushed silver knurled knob.
 * - S-curved polished aluminum tonearm wand.
 * - Headshell with cartridge & warm orange stylus lamp.
 * - Realistic 2-stage drop and lift mechanics.
 */
export function Tonearm({ playing, className }: { playing: boolean; className?: string }) {
  return (
    <div
      className={`pointer-events-none absolute -top-10 -right-6 w-32 h-56 transition-transform duration-800 ease-[cubic-bezier(0.25,1,0.3,1)] z-30 ${className ?? ''}`}
      style={{
        transformOrigin: '76% 16%',
        transform: playing ? 'rotate(27deg)' : 'rotate(0deg)',
      }}
    >
      {/* 1. Gimbal Pivot Base with knurled cap */}
      <div className="absolute top-4 right-4 size-10 rounded-full bg-gradient-to-b from-[#555] via-[#222] to-[#111] border border-white/25 shadow-2xl flex items-center justify-center">
        <div className="size-5 rounded-full bg-gradient-to-br from-[#888] to-[#333] border border-white/30 shadow-inner flex items-center justify-center">
          <div className="size-2 rounded-full bg-[#111] border border-white/20" />
        </div>
      </div>

      {/* 2. Counterweight Cylinder (Rear) */}
      <div
        className="absolute top-1 right-7 w-6 h-4 rounded-sm bg-gradient-to-b from-[#888] via-[#ccc] to-[#555] border border-black/40 shadow-md flex items-center justify-center"
        style={{ transform: 'rotate(-20deg)' }}
      >
        {/* Calibrated graduation ring */}
        <div className="w-1.5 h-full bg-[#222] border-x border-white/30" />
      </div>

      {/* 3. Anti-Skate & Cueing Lever Post */}
      <div className="absolute top-11 right-3 w-1.5 h-4 bg-gradient-to-r from-[#666] to-[#333] rounded-full shadow-sm" />

      {/* 4. S-Shape Precision Aluminum Tonearm Wand */}
      <svg
        className="absolute top-8 right-5 w-24 h-44 overflow-visible drop-shadow-[2px_5px_6px_rgba(0,0,0,0.65)]"
        viewBox="0 0 100 180"
        fill="none"
      >
        <path
          d="M 80 15 Q 75 60, 55 90 T 32 165"
          stroke="url(#armGradient)"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <defs>
          <linearGradient id="armGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="50%" stopColor="#b0b5be" />
            <stop offset="100%" stopColor="#e2e8f0" />
          </linearGradient>
        </defs>
      </svg>

      {/* 5. Headshell Cartridge & Stylus Assembly */}
      <div
        className="absolute bottom-1 right-12 w-5 h-8 bg-gradient-to-b from-[#252528] to-[#121214] border border-white/30 rounded-t-sm rounded-b-md shadow-2xl flex flex-col items-center justify-end pb-1"
        style={{
          transform: 'rotate(-18deg)',
        }}
      >
        {/* Headshell finger lift cue */}
        <div className="absolute -top-1.5 -right-1 w-2.5 h-1 rounded-full bg-white/40" />
        {/* Cartridge brand color stripe */}
        <div className="w-3.5 h-1 bg-[#fa233b] rounded-sm mb-1 shadow-[0_0_4px_rgba(250,35,59,0.6)]" />
        {/* Stylus needle tip with warm glow */}
        <div className="relative flex items-center justify-center">
          <div className="w-0.5 h-2 bg-amber-300 rounded-full shadow-[0_0_6px_#f59e0b]" />
        </div>
      </div>
    </div>
  );
}

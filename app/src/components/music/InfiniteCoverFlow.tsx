import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Play, Disc3, Sparkles, ChevronLeft, ChevronRight, Music2 } from 'lucide-react';
import { sizedArtwork } from '@/lib/artwork';

export interface CoverFlowItem {
  id: string;
  title: string;
  artist: string;
  artworkUrl?: string | null;
  trackCount?: number;
  isHiRes?: boolean;
  onPlay?: () => void;
  onSelect?: () => void;
}

interface InfiniteCoverFlowProps {
  items: CoverFlowItem[];
  initialIndex?: number;
  onActiveChange?: (index: number, item: CoverFlowItem) => void;
  className?: string;
  height?: number;
}

export function InfiniteCoverFlow({
  items,
  initialIndex = 0,
  onActiveChange,
  className = '',
  height = 420,
}: InfiniteCoverFlowProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [dragOffset, setDragOffset] = useState(0);
  const isDraggingRef = useRef(false);
  const startXRef = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const onActiveChangeRef = useRef(onActiveChange);
  onActiveChangeRef.current = onActiveChange;

  const count = items.length;

  // Safe modulo wrap helper
  const wrap = useCallback(
    (val: number) => {
      if (count === 0) return 0;
      return ((val % count) + count) % count;
    },
    [count],
  );

  const goTo = useCallback(
    (index: number) => {
      const wrapped = wrap(index);
      setActiveIndex(wrapped);
      setDragOffset(0);
      const currentItem = itemsRef.current[wrapped];
      if (currentItem) {
        onActiveChangeRef.current?.(wrapped, currentItem);
      }
    },
    [wrap],
  );

  const prev = useCallback(() => {
    goTo(activeIndex - 1);
  }, [goTo, activeIndex]);

  const next = useCallback(() => {
    goTo(activeIndex + 1);
  }, [goTo, activeIndex]);

  // Keyboard navigation: Left/Right arrows
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [prev, next]);

  // Pointer drag events with smooth release
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (count <= 1) return;
    isDraggingRef.current = true;
    startXRef.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - startXRef.current;
    setDragOffset(dx);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}

    const threshold = 50; // pixels to step
    if (dragOffset > threshold) {
      goTo(activeIndex - Math.max(1, Math.round(dragOffset / 140)));
    } else if (dragOffset < -threshold) {
      goTo(activeIndex + Math.max(1, Math.round(-dragOffset / 140)));
    } else {
      setDragOffset(0);
    }
  };

  // Wheel horizontal/vertical scrolling
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(delta) > 20) {
      if (delta > 0) next();
      else prev();
    }
  };

  const virtualOffset = activeIndex - dragOffset / 140;
  const currentActive = items[wrap(activeIndex)];

  // Visible window: render covers within offset delta [-5 .. 5]
  const visibleCovers = useMemo(() => {
    if (count === 0) return [];
    const windowRadius = Math.min(5, Math.floor(count / 2) + 1);
    const centerIdx = activeIndex;
    const result: Array<{ item: CoverFlowItem; index: number; delta: number; uniqueKey: string }> = [];

    for (let d = -windowRadius; d <= windowRadius; d++) {
      const idx = wrap(centerIdx + d);
      const item = items[idx];
      if (item) {
        const delta = d + dragOffset / 140;
        result.push({
          item,
          index: idx,
          delta,
          uniqueKey: `${item.id}-${centerIdx + d}`,
        });
      }
    }

    // Sort by z-index (items further from center render behind)
    return result.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [count, activeIndex, dragOffset, items, wrap]);

  if (count === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center text-white/40">
        <Disc3 size={40} className="mb-2 text-white/20" />
        <p className="text-sm">No albums available for Cover Flow</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative select-none flex flex-col items-center justify-between overflow-hidden ${className}`}
      style={{ height: `${height}px` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* Ambient background depth glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center -z-10">
        <div
          className="size-72 rounded-full opacity-35 blur-[120px] transition-colors duration-700"
          style={{ background: 'radial-gradient(circle, rgba(250,35,59,0.3) 0%, rgba(139,92,246,0.2) 70%, transparent 100%)' }}
        />
      </div>

      {/* 3D Perspective Cover Flow Stage */}
      <div
        className="relative size-full flex items-center justify-center"
        style={{
          perspective: '1100px',
          perspectiveOrigin: '50% 48%',
          transformStyle: 'preserve-3d',
        }}
      >
        {visibleCovers.map(({ item, index, delta, uniqueKey }) => {
          const absDelta = Math.abs(delta);
          const isCenter = absDelta < 0.45;

          let rotateY = 0;
          let translateX = 0;
          let translateZ = 0;
          let scale = 1;
          let opacity = 1;

          if (isCenter) {
            rotateY = -delta * 40;
            translateX = -delta * 140;
            translateZ = 90 - absDelta * 120;
            scale = 1.15 - absDelta * 0.2;
            opacity = 1;
          } else if (delta < 0) {
            rotateY = 56;
            translateX = -140 + delta * 65;
            translateZ = -90 - Math.min(200, absDelta * 30);
            scale = Math.max(0.75, 0.95 - absDelta * 0.05);
            opacity = Math.max(0.18, 1 - absDelta * 0.16);
          } else {
            rotateY = -56;
            translateX = 140 + delta * 65;
            translateZ = -90 - Math.min(200, absDelta * 30);
            scale = Math.max(0.75, 0.95 - absDelta * 0.05);
            opacity = Math.max(0.18, 1 - absDelta * 0.16);
          }

          const artSrc = item.artworkUrl ? sizedArtwork(item.artworkUrl, 400) : null;

          return (
            <div
              key={uniqueKey}
              onClick={() => {
                if (!isCenter) {
                  goTo(index);
                } else {
                  item.onSelect?.();
                }
              }}
              className="absolute size-48 sm:size-56 cursor-pointer will-change-transform group"
              style={{
                transformStyle: 'preserve-3d',
                transform: `translateX(${translateX.toFixed(1)}px) translateZ(${translateZ.toFixed(1)}px) rotateY(${rotateY.toFixed(1)}deg) scale(${scale.toFixed(3)})`,
                opacity: opacity.toFixed(2),
                zIndex: Math.round(100 - absDelta * 10),
                transition: isDraggingRef.current ? 'none' : 'transform 450ms cubic-bezier(0.16, 1, 0.3, 1), opacity 450ms ease',
              }}
            >
              {/* Album Cover Tile */}
              <div
                className="relative size-full rounded-2xl overflow-hidden bg-[#181a24] shadow-[0_20px_45px_rgba(0,0,0,0.85)] border border-white/12 transition-transform duration-300"
                style={{
                  // Floor reflection effect
                  WebkitBoxReflect:
                    'below 6px linear-gradient(transparent, transparent 62%, rgba(255,255,255,0.22))',
                }}
              >
                {artSrc ? (
                  <img
                    src={artSrc}
                    alt={item.title}
                    className="size-full object-cover select-none pointer-events-none"
                    decoding="async"
                  />
                ) : (
                  <div className="size-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-tr from-[#161822] to-[#252838] text-white/40">
                    <Music2 size={36} className="mb-2 text-white/30" />
                    <span className="text-xs font-bold text-white/80 line-clamp-1">{item.title}</span>
                    <span className="text-[10px] text-white/40 line-clamp-1">{item.artist}</span>
                  </div>
                )}

                {/* 3D Sheen overlay on tilted covers */}
                {!isCenter && (
                  <div
                    className="pointer-events-none absolute inset-0 bg-black/35 transition-opacity"
                    style={{
                      background:
                        delta < 0
                          ? 'linear-gradient(to right, rgba(0,0,0,0.5), transparent)'
                          : 'linear-gradient(to left, rgba(0,0,0,0.5), transparent)',
                    }}
                  />
                )}

                {/* Center Hover Play Overlay */}
                {isCenter && (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      item.onPlay?.();
                    }}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-200 backdrop-blur-[2px]"
                  >
                    <div className="size-14 rounded-full bg-white text-black shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-transform">
                      <Play size={24} className="fill-black ml-1" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation Arrows & Active Album Metadata Bar */}
      <div className="relative z-20 flex flex-col items-center text-center pb-2 px-4 max-w-xl w-full">
        <div className="flex items-center justify-between w-full mb-1">
          <button
            type="button"
            onClick={prev}
            className="size-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white transition-colors cursor-pointer active:scale-90"
            aria-label="Previous album"
          >
            <ChevronLeft size={18} />
          </button>

          {currentActive && (
            <div className="flex flex-col items-center min-w-0 px-4">
              <div className="flex items-center gap-2">
                <h3
                  onClick={() => currentActive.onSelect?.()}
                  className="text-base sm:text-lg font-bold text-white truncate hover:underline cursor-pointer"
                >
                  {currentActive.title}
                </h3>
                {currentActive.isHiRes && (
                  <span className="inline-flex items-center gap-0.5 rounded-md bg-amber-400/20 border border-amber-400/30 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-300">
                    <Sparkles size={9} />
                    HI-RES
                  </span>
                )}
              </div>
              <p className="text-xs text-white/60 truncate mt-0.5">{currentActive.artist}</p>
              {currentActive.trackCount !== undefined && (
                <span className="text-[10px] font-mono text-white/40 mt-0.5">{currentActive.trackCount} tracks</span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={next}
            className="size-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/10 flex items-center justify-center text-white transition-colors cursor-pointer active:scale-90"
            aria-label="Next album"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import { Mic2, Sparkles, Volume2, ShieldCheck } from 'lucide-react';
import { useKaraoke } from '@/state/karaoke';

export function KaraokeButton({ className }: { className?: string }) {
  const { enabled, vocalSuppression, preserveBass, setEnabled, setVocalSuppression, setPreserveBass, toggle } = useKaraoke();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutside);
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [popoverOpen]);

  const percentage = Math.round(vocalSuppression * 100);

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      <button
        type="button"
        aria-label="Karaoke Vocal Remover (Sing Mode)"
        title={`Karaoke / Sing Mode: ${enabled ? `ON (${percentage}% Vocal Reduction)` : 'OFF'} (Right-click or hold for slider)`}
        aria-pressed={enabled}
        onClick={() => toggle()}
        onContextMenu={(e) => {
          e.preventDefault();
          setPopoverOpen(!popoverOpen);
        }}
        className={`${className ?? ''} relative flex items-center justify-center transition-all ${
          enabled
            ? 'text-[#fa233b] drop-shadow-[0_0_10px_rgba(250,35,59,0.5)]'
            : 'text-white/60 hover:text-white'
        }`}
      >
        <Mic2 size={18} strokeWidth={2.2} />
        {enabled && (
          <span className="absolute -top-1 -right-1 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#fa233b] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#fa233b]" />
          </span>
        )}
      </button>

      {/* Apple Music Sing-Style Quick Popover */}
      {popoverOpen && (
        <div
          className="absolute right-0 top-10 z-50 w-56 rounded-2xl border border-white/12 bg-[#12141c]/98 p-3.5 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-2.5 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Mic2 size={15} className={enabled ? 'text-[#fa233b]' : 'text-white/60'} />
              <span className="text-xs font-semibold text-white tracking-wide">Karaoke / Sing</span>
            </div>
            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase transition-colors ${
                enabled
                  ? 'bg-[#fa233b] text-white shadow-sm'
                  : 'bg-white/10 text-white/50 hover:bg-white/20 hover:text-white'
              }`}
            >
              {enabled ? 'Active' : 'Off'}
            </button>
          </div>

          {/* Vocal Suppression Slider */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] font-medium text-white/70 mb-1.5">
              <span>Vocal Attenuation</span>
              <span className="font-mono font-bold text-white">{percentage}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={vocalSuppression}
              disabled={!enabled}
              onChange={(e) => setVocalSuppression(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-white/15 rounded-lg appearance-none cursor-pointer accent-[#fa233b] disabled:opacity-40"
            />
            <div className="flex justify-between text-[9px] text-white/40 mt-1">
              <span>Original Vocals</span>
              <span>Full Instrumental</span>
            </div>
          </div>

          {/* Low-End Punch Protection */}
          <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-white/70">
              <ShieldCheck size={13} className={preserveBass ? 'text-emerald-400' : 'text-white/40'} />
              <span className="text-[11px]">Keep Bass / Kicks</span>
            </div>
            <button
              type="button"
              onClick={() => setPreserveBass(!preserveBass)}
              className={`w-7 h-4 rounded-full transition-colors relative flex items-center p-0.5 cursor-pointer ${
                preserveBass ? 'bg-emerald-500' : 'bg-white/20'
              }`}
            >
              <span
                className={`block size-3 rounded-full bg-white transition-transform ${
                  preserveBass ? 'translate-x-3' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

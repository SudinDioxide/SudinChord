import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  useAudioFx,
  EQ_FREQUENCIES,
  EQ_PRESETS,
  calculateAutoHeadroomDb,
  type EqPreset,
} from '@/state/audioFx';
import { getAudioAnalyser, usePlayer } from '@/state/player';
import {
  X,
  Sliders,
  Volume2,
  RotateCcw,
  ChevronDown,
  Check,
  ShieldCheck,
  BookmarkPlus,
  Trash2,
  SplitSquareVertical,
} from 'lucide-react';

function AppleToggle({
  checked,
  onChange,
  label,
  activeColor = '#fa233b',
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label?: string;
  activeColor?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: '38px',
        height: '22px',
        padding: '2px',
        borderRadius: '9999px',
        backgroundColor: checked ? activeColor : 'rgba(255, 255, 255, 0.18)',
        border: 'none',
        outline: 'none',
        cursor: 'pointer',
        boxSizing: 'border-box',
        transition: 'background-color 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease',
        boxShadow: checked
          ? `0 0 10px ${activeColor === '#fa233b' ? 'rgba(250, 35, 59, 0.45)' : 'rgba(52, 199, 89, 0.45)'}`
          : 'inset 0 0 0 1px rgba(255, 255, 255, 0.1)',
        flexShrink: 0,
        userSelect: 'none',
        verticalAlign: 'middle',
      }}
    >
      <span
        style={{
          display: 'block',
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          backgroundColor: '#ffffff',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.35), 0 0 1px rgba(0, 0, 0, 0.2)',
          transform: checked ? 'translateX(16px)' : 'translateX(0px)',
          transition: 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
          pointerEvents: 'none',
          boxSizing: 'border-box',
          flexShrink: 0,
        }}
      />
    </button>
  );
}

export function EqualizerModal() {
  const {
    eqEnabled,
    preset,
    bands,
    preamp,
    autoHeadroom,
    customPresets,
    abComparing,
    normalization,
    modalOpen,
    setEqEnabled,
    setBandGain,
    setPreamp,
    setAutoHeadroom,
    setPreset,
    saveCustomPreset,
    deleteCustomPreset,
    toggleAB,
    setNormalization,
    setModalOpen,
    resetEq,
  } = useAudioFx();

  const isPlaying = usePlayer((s) => s.status === 'playing');
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  const fadersContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDraggingRef = useRef(false);

  // Global Keyboard Shortcut: Ctrl+Alt+E / Cmd+Alt+E & Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        setModalOpen(!useAudioFx.getState().modalOpen);
      } else if (e.key === 'Escape' && useAudioFx.getState().modalOpen) {
        setPresetMenuOpen(false);
        setSavingPreset(false);
        setModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setModalOpen]);

  const allPresets = useMemo(() => [...EQ_PRESETS, ...customPresets], [customPresets]);
  const currentPreset = allPresets.find((p) => p.id === preset);
  const currentPresetName = currentPreset ? currentPreset.name : preset === 'custom' ? 'Custom' : 'Flat';

  const headroomDb = calculateAutoHeadroomDb(bands, preamp, autoHeadroom);

  // Group presets by category
  const categorizedPresets = useMemo(() => {
    const acoustic = EQ_PRESETS.filter((p) => p.category === 'Acoustic');
    const genre = EQ_PRESETS.filter((p) => p.category === 'Genre');
    const general = EQ_PRESETS.filter((p) => p.category === 'General');
    return { general, acoustic, genre, custom: customPresets };
  }, [customPresets]);

  // Real-Time Spectrum and Spline EQ Curve Rendering
  useEffect(() => {
    if (!modalOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const analyser = getAudioAnalyser();
    const binCount = analyser ? analyser.frequencyBinCount : 128;
    const freqData = new Uint8Array(binCount);

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      // 1. Draw Real-Time FFT Spectrum Overlay
      if (analyser && isPlaying) {
        analyser.getByteFrequencyData(freqData);

        const barCount = 48;
        const barWidth = width / barCount;
        const spectrumGrad = ctx.createLinearGradient(0, height, 0, 0);
        spectrumGrad.addColorStop(0, 'rgba(255, 255, 255, 0.02)');
        spectrumGrad.addColorStop(0.5, 'rgba(250, 35, 59, 0.12)');
        spectrumGrad.addColorStop(1, 'rgba(255, 80, 100, 0.28)');

        ctx.fillStyle = spectrumGrad;
        for (let i = 0; i < barCount; i++) {
          // Logarithmic distribution across frequencies
          const logIdx = Math.floor(Math.pow(i / barCount, 2.0) * (binCount * 0.85));
          const val = freqData[Math.min(binCount - 1, logIdx)] || 0;
          const barHeight = (val / 255) * (height * 0.85);
          if (barHeight > 1) {
            ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
          }
        }
      }

      // 2. Draw Smooth Spline EQ Response Curve
      const effectiveBands = !eqEnabled || abComparing ? [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] : bands;
      const faderCount = EQ_FREQUENCIES.length;
      const stepX = width / (faderCount - 1);

      const points: { x: number; y: number }[] = effectiveBands.map((gain, i) => {
        const x = i * stepX;
        // 0dB is at height / 2. +12dB is at y = 14, -12dB is at y = height - 14.
        const fraction = (gain + 12) / 24;
        const y = height - fraction * height;
        return { x, y };
      });

      if (points.length < 2 || !points[0]) return;

      // Construct Catmull-Rom or cubic Bezier curve through points
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);

      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(i - 1, 0)] ?? points[0];
        const p1 = points[i] ?? points[0];
        const p2 = points[i + 1] ?? points[points.length - 1] ?? points[0];
        const p3 = points[Math.min(i + 2, points.length - 1)] ?? p2;

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }

      // Fill area under/over the curve relative to center 0dB
      const curveFillGrad = ctx.createLinearGradient(0, 0, 0, height);
      if (abComparing) {
        curveFillGrad.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
        curveFillGrad.addColorStop(1, 'rgba(245, 158, 11, 0.02)');
      } else if (eqEnabled) {
        curveFillGrad.addColorStop(0, 'rgba(250, 35, 59, 0.22)');
        curveFillGrad.addColorStop(1, 'rgba(250, 35, 59, 0.02)');
      } else {
        curveFillGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
        curveFillGrad.addColorStop(1, 'rgba(255, 255, 255, 0.01)');
      }

      ctx.save();
      ctx.lineTo(width, height / 2);
      ctx.lineTo(0, height / 2);
      ctx.closePath();
      ctx.fillStyle = curveFillGrad;
      ctx.fill();
      ctx.restore();

      // Draw Curve Stroke
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(i - 1, 0)] ?? points[0];
        const p1 = points[i] ?? points[0];
        const p2 = points[i + 1] ?? points[points.length - 1] ?? points[0];
        const p3 = points[Math.min(i + 2, points.length - 1)] ?? p2;

        const cp1x = p1.x + (p2.x - p0.x) / 6;
        const cp1y = p1.y + (p2.y - p0.y) / 6;
        const cp2x = p2.x - (p3.x - p1.x) / 6;
        const cp2y = p2.y - (p3.y - p1.y) / 6;

        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
      }

      if (abComparing) {
        ctx.strokeStyle = '#f59e0b';
        ctx.setLineDash([5, 4]);
      } else if (eqEnabled) {
        ctx.strokeStyle = '#fa233b';
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.setLineDash([]);
      }
      ctx.lineWidth = 2.5;
      ctx.shadowColor = abComparing ? '#f59e0b' : eqEnabled ? '#fa233b' : 'transparent';
      ctx.shadowBlur = eqEnabled ? 8 : 0;
      ctx.stroke();
      ctx.shadowBlur = 0;

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [modalOpen, isPlaying, eqEnabled, abComparing, bands]);

  // Pointer sweep & multi-fader drag interaction
  const updateFaderFromCoord = useCallback(
    (clientX: number, clientY: number) => {
      if (!eqEnabled || !fadersContainerRef.current) return;
      const rect = fadersContainerRef.current.getBoundingClientRect();
      const relX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const fractionX = relX / rect.width;
      const bandIndex = Math.min(EQ_FREQUENCIES.length - 1, Math.max(0, Math.floor(fractionX * EQ_FREQUENCIES.length)));

      const clampedY = Math.max(rect.top, Math.min(rect.bottom, clientY));
      const fractionY = 1 - (clampedY - rect.top) / rect.height; // 0 (bottom) to 1 (top)
      const gain = Math.round((fractionY * 24 - 12) * 2) / 2; // -12 to +12 dB in 0.5 steps
      setBandGain(bandIndex, gain);
    },
    [eqEnabled, setBandGain],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!eqEnabled) return;
    isDraggingRef.current = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    updateFaderFromCoord(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    updateFaderFromCoord(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handleSavePresetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetName.trim()) return;
    saveCustomPreset(newPresetName.trim());
    setNewPresetName('');
    setSavingPreset(false);
  };

  if (!modalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={() => {
        setPresetMenuOpen(false);
        setSavingPreset(false);
        setModalOpen(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Audio Equalizer & Studio DSP"
    >
      <div
        className="relative flex w-full max-w-[690px] flex-col rounded-[26px] border border-white/12 bg-[#12141c]/98 p-6 shadow-2xl backdrop-blur-2xl"
        onClick={(e) => {
          e.stopPropagation();
          setPresetMenuOpen(false);
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-2xl bg-white/10 text-white shadow-sm border border-white/10">
              <Sliders size={20} className={eqEnabled ? 'text-[#fa233b]' : 'text-white/60'} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-white tracking-wide">Audio Equalizer & DSP</h2>
                {abComparing && (
                  <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-400 animate-pulse">
                    A/B BYPASS
                  </span>
                )}
              </div>
              <p className="text-xs text-white/50">10-band studio frequency control, anti-clipping headroom & real-time spectrum</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Master EQ Switch */}
            <div className="flex items-center gap-2.5 rounded-[12px] bg-white/[0.05] border border-white/10 px-3 h-8">
              <span className={`text-xs font-semibold tracking-wide transition-colors ${eqEnabled ? 'text-white' : 'text-white/50'}`}>
                EQ
              </span>
              <AppleToggle checked={eqEnabled} onChange={setEqEnabled} label="Toggle Equalizer" />
            </div>

            <button
              onClick={() => setModalOpen(false)}
              aria-label="Close"
              className="flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Toolbar: Presets Menu, Save Custom, A/B Compare & Loudness Normalizer */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            {/* Preset Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPresetMenuOpen(!presetMenuOpen);
                  setSavingPreset(false);
                }}
                className="h-8 px-3 rounded-[12px] bg-white/[0.07] border border-white/10 hover:bg-white/[0.12] text-white text-xs font-medium flex items-center gap-2 transition-all shadow-sm cursor-pointer"
              >
                <span className="text-white/50">Preset:</span>
                <span className="font-semibold text-white max-w-[130px] truncate">{currentPresetName}</span>
                <ChevronDown size={14} className="text-white/60" />
              </button>

              {presetMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setPresetMenuOpen(false)} />
                  <div
                    className="absolute left-0 top-10 z-50 w-64 max-h-[380px] overflow-y-auto rounded-2xl border border-white/12 bg-[#161922]/98 p-2 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 custom-scrollbar"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Custom Presets Group */}
                    {categorizedPresets.custom.length > 0 && (
                      <div className="mb-2">
                        <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
                          My Custom Presets
                        </div>
                        {categorizedPresets.custom.map((p) => {
                          const isSelected = preset === p.id;
                          return (
                            <div
                              key={p.id}
                              className={`group/preset w-full h-8 px-2.5 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                                isSelected ? 'bg-white/15 text-white font-medium' : 'text-white/70 hover:bg-white/10 hover:text-white'
                              }`}
                              onClick={() => {
                                setPreset(p.id);
                                setPresetMenuOpen(false);
                              }}
                            >
                              <span className="truncate pr-2">{p.name}</span>
                              <div className="flex items-center gap-1.5">
                                {isSelected && <Check size={14} className="text-white" />}
                                <button
                                  type="button"
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    deleteCustomPreset(p.id);
                                  }}
                                  className="opacity-0 group-hover/preset:opacity-100 hover:text-red-400 p-1 transition-opacity"
                                  title="Delete Preset"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Acoustic & Studio Presets */}
                    <div className="mb-2">
                      <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
                        Acoustic & Studio
                      </div>
                      {[...categorizedPresets.general, ...categorizedPresets.acoustic].map((p) => {
                        const isSelected = preset === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setPreset(p.id);
                              setPresetMenuOpen(false);
                            }}
                            className={`w-full h-8 px-2.5 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                              isSelected ? 'bg-white/15 text-white font-medium' : 'text-white/70 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <span>{p.name}</span>
                            {isSelected && <Check size={14} className="text-white" />}
                          </button>
                        );
                      })}
                    </div>

                    {/* Music Genres */}
                    <div>
                      <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white/40">
                        Music Genres
                      </div>
                      {categorizedPresets.genre.map((p) => {
                        const isSelected = preset === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setPreset(p.id);
                              setPresetMenuOpen(false);
                            }}
                            className={`w-full h-8 px-2.5 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                              isSelected ? 'bg-white/15 text-white font-medium' : 'text-white/70 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <span>{p.name}</span>
                            {isSelected && <Check size={14} className="text-white" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Save Custom Preset Button */}
            {!savingPreset ? (
              <button
                type="button"
                onClick={() => setSavingPreset(true)}
                title="Save current EQ as custom preset"
                className="h-8 px-2.5 rounded-[12px] bg-white/[0.05] border border-white/10 hover:bg-white/10 text-white/70 hover:text-white text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <BookmarkPlus size={13} />
                <span className="hidden sm:inline">Save</span>
              </button>
            ) : (
              <form onSubmit={handleSavePresetSubmit} className="flex items-center gap-1.5">
                <input
                  type="text"
                  autoFocus
                  placeholder="Preset name..."
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  className="h-8 w-32 px-2.5 text-xs rounded-[10px] bg-white/10 border border-white/20 text-white placeholder-white/40 outline-none focus:border-[#fa233b]"
                />
                <button
                  type="submit"
                  className="h-8 px-2.5 rounded-[10px] bg-[#fa233b] text-white text-xs font-semibold hover:bg-[#fa233b]/90 transition-colors"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setSavingPreset(false)}
                  className="h-8 px-2 rounded-[10px] text-white/60 hover:text-white text-xs"
                >
                  ✕
                </button>
              </form>
            )}

            {/* A/B Compare Toggle */}
            <button
              type="button"
              onClick={toggleAB}
              disabled={!eqEnabled}
              title="Toggle A/B comparison between your EQ tweak and Flat bypass"
              className={`h-8 px-3 rounded-[12px] border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                abComparing
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 shadow-sm'
                  : 'bg-white/[0.05] border-white/10 text-white/60 hover:text-white hover:bg-white/10'
              } ${!eqEnabled ? 'opacity-40 pointer-events-none' : ''}`}
            >
              <SplitSquareVertical size={13} />
              <span>A/B</span>
            </button>
          </div>

          {/* Loudness Normalizer */}
          <div className="flex items-center gap-2 rounded-[12px] bg-white/[0.05] border border-white/10 px-3 h-8">
            <Volume2 size={13} className={normalization ? 'text-white' : 'text-white/40'} />
            <span className="text-xs text-white/80 font-medium">Loudness Normalizer</span>
            <AppleToggle checked={normalization} onChange={setNormalization} label="Toggle Loudness Normalizer" />
          </div>
        </div>

        {/* Preamp & Anti-Clipping Headroom Strip */}
        <div className="mt-3.5 flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/5 px-3.5 py-2">
          <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
            <span className="text-[11px] font-semibold text-white/70 tracking-wide uppercase">Preamp:</span>
            <span className="w-12 text-xs font-mono font-bold text-white text-right">
              {preamp > 0 ? `+${preamp}` : preamp} dB
            </span>
            <input
              type="range"
              min={-12}
              max={12}
              step={0.5}
              value={preamp}
              disabled={!eqEnabled || abComparing}
              onChange={(e) => setPreamp(parseFloat(e.target.value))}
              onDoubleClick={() => setPreamp(0)}
              title="Preamp Gain (-12 dB to +12 dB, double-click to zero)"
              className="flex-1 accent-[#fa233b] cursor-pointer h-1.5 bg-white/15 rounded-lg appearance-none"
            />
          </div>

          <div className="flex items-center gap-2.5 pl-3 border-l border-white/10">
            <button
              type="button"
              onClick={() => setAutoHeadroom(!autoHeadroom)}
              className={`flex items-center gap-1.5 text-xs transition-colors cursor-pointer select-none ${
                autoHeadroom ? 'text-emerald-400 font-medium' : 'text-white/40'
              }`}
              title="Automatically lowers preamp gain to prevent digital clipping when EQ bands are boosted"
            >
              <ShieldCheck size={14} className={autoHeadroom ? 'text-emerald-400' : 'text-white/40'} />
              <span>Auto Headroom</span>
            </button>
            {autoHeadroom && headroomDb < 0 && (
              <span className="rounded-md bg-emerald-500/15 border border-emerald-500/25 px-1.5 py-0.5 text-[10px] font-mono font-bold text-emerald-300">
                {headroomDb.toFixed(1)} dB
              </span>
            )}
          </div>
        </div>

        {/* Studio Graphic EQ Faders Grid & Real-Time Spectrum Canvas */}
        <div
          ref={fadersContainerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="relative mt-3.5 rounded-2xl bg-black/50 p-4 border border-white/5 select-none overflow-hidden"
        >
          {/* Real-Time FFT Spectrum & Spline Response Curve Canvas */}
          <canvas
            ref={canvasRef}
            width={600}
            height={200}
            className="pointer-events-none absolute left-12 right-3 top-7 bottom-10 w-[calc(100%-60px)] h-[calc(100%-68px)] z-0"
            aria-hidden="true"
          />

          {/* Y-Axis Guidelines & Scale */}
          <div className="pointer-events-none absolute left-3 right-3 top-7 bottom-10 flex flex-col justify-between z-10">
            <div className="flex items-center w-full">
              <span className="w-11 text-[9px] font-mono text-white/35 text-left">+12dB</span>
              <div className="flex-1 border-b border-white/[0.06]" />
            </div>
            <div className="flex items-center w-full">
              <span className="w-11 text-[9px] font-mono text-white/35 text-left">+6dB</span>
              <div className="flex-1 border-b border-white/[0.04]" />
            </div>
            <div className="flex items-center w-full">
              <span className="w-11 text-[9px] font-mono font-semibold text-white/60 text-left">0dB</span>
              <div className="flex-1 border-b border-white/20" />
            </div>
            <div className="flex items-center w-full">
              <span className="w-11 text-[9px] font-mono text-white/35 text-left">-6dB</span>
              <div className="flex-1 border-b border-white/[0.04]" />
            </div>
            <div className="flex items-center w-full">
              <span className="w-11 text-[9px] font-mono text-white/35 text-left">-12dB</span>
              <div className="flex-1 border-b border-white/[0.06]" />
            </div>
          </div>

          {/* 10 Vertical Fader Columns */}
          <div className="relative z-20 flex items-stretch justify-between h-52 pl-12 pr-2 gap-1.5 pointer-events-none">
            {EQ_FREQUENCIES.map((freq, i) => {
              const gain = bands[i] ?? 0;
              const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
              const fraction = (gain + 12) / 24;
              const percent = fraction * 100;
              const isZero = Math.abs(gain) < 0.1;

              return (
                <div
                  key={freq}
                  className="flex flex-1 flex-col items-center justify-between h-full group"
                >
                  {/* Gain readout */}
                  <span
                    className={`text-[10px] font-mono h-4 flex items-center transition-colors ${
                      !isZero && eqEnabled && !abComparing ? 'text-white font-semibold' : 'text-white/35'
                    }`}
                  >
                    {gain > 0 ? `+${gain}` : gain}
                  </span>

                  {/* Interactive Fader Track Area */}
                  <div
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setBandGain(i, 0);
                    }}
                    className="relative flex-1 w-full flex items-center justify-center py-1 pointer-events-auto cursor-pointer"
                    title={`${label}Hz: ${gain > 0 ? `+${gain}` : gain} dB (Double-click to reset)`}
                  >
                    {/* Background Slot */}
                    <div className="relative h-full w-[4px] bg-white/10 rounded-full overflow-hidden">
                      {/* Active level fill from center 0dB line */}
                      {eqEnabled && !abComparing && (
                        <div
                          className="absolute left-0 right-0 bg-white/80 transition-all duration-75"
                          style={
                            gain >= 0
                              ? {
                                  bottom: '50%',
                                  height: `${(gain / 12) * 50}%`,
                                }
                              : {
                                  top: '50%',
                                  height: `${(-gain / 12) * 50}%`,
                                }
                          }
                        />
                      )}
                    </div>

                    {/* Console-Style Fader Knob Handle */}
                    <div
                      className={`absolute left-1/2 -translate-x-1/2 w-6 h-3 rounded-[4px] shadow-lg border transition-all pointer-events-none flex items-center justify-center ${
                        eqEnabled && !abComparing
                          ? 'bg-white text-black border-white/40 shadow-black/60 group-hover:scale-110'
                          : 'bg-white/40 border-white/20'
                      }`}
                      style={{
                        bottom: `calc(${percent}% - 6px)`,
                      }}
                    >
                      {/* Fader center grip notch line */}
                      <div className="w-2.5 h-[1.5px] bg-black/60 rounded-full" />
                    </div>
                  </div>

                  {/* Frequency label */}
                  <span className="text-[10px] font-medium text-white/50 group-hover:text-white transition-colors tracking-tight">
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between pt-1">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={resetEq}
              className="flex items-center gap-1.5 rounded-[12px] px-3 py-1.5 text-xs text-white/50 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
            <span className="text-[11px] text-white/30 hidden sm:inline">
              Drag across faders to sculpt • Double-click to zero • Ctrl+Alt+E shortcut
            </span>
          </div>

          <button
            type="button"
            onClick={() => setModalOpen(false)}
            className="rounded-[20px] h-8 px-6 bg-white text-xs font-semibold text-black hover:bg-white/90 active:scale-95 transition-all shadow-sm cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState, useRef } from 'react';
import { useAudioFx, EQ_FREQUENCIES, EQ_PRESETS, AUTOEQ_PROFILES, ALL_PRESETS } from '@/state/audioFx';
import { X, Sliders, Volume2, RotateCcw, ChevronDown, Check, Headphones, Music, Search } from 'lucide-react';

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
    normalization,
    modalOpen,
    setEqEnabled,
    setBandGain,
    setPreset,
    setNormalization,
    setModalOpen,
    resetEq,
  } = useAudioFx();

  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const [presetTab, setPresetTab] = useState<'genre' | 'headphone'>('genre');
  const [eqSearch, setEqSearch] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('All');
  const activeFaderRef = useRef<number | null>(null);

  if (!modalOpen) return null;

  const currentPreset = ALL_PRESETS.find((p) => p.id === preset);
  const isHeadphonePreset = currentPreset?.category === 'headphone';
  const currentPresetName =
    currentPreset?.name ?? (preset === 'custom' ? 'Custom' : 'Flat');

  // Interactive fader pointer dragging
  const handleFaderStart = (index: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (!eqEnabled) return;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    activeFaderRef.current = index;

    const rect = target.getBoundingClientRect();
    const update = (clientY: number) => {
      const clampedY = Math.max(rect.top, Math.min(rect.bottom, clientY));
      const fraction = 1 - (clampedY - rect.top) / rect.height; // 0 (bottom) to 1 (top)
      const gain = Math.round((fraction * 24 - 12) * 2) / 2; // -12 to +12 dB with 0.5 step
      setBandGain(index, Math.max(-12, Math.min(12, gain)));
    };

    update(e.clientY);

    const onPointerMove = (ev: PointerEvent) => {
      if (activeFaderRef.current === index) {
        update(ev.clientY);
      }
    };

    const onPointerUp = (ev: PointerEvent) => {
      try {
        target.releasePointerCapture(ev.pointerId);
      } catch {}
      activeFaderRef.current = null;
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  };

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={() => {
        setPresetMenuOpen(false);
        setModalOpen(false);
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Audio Equalizer & FX"
    >
      <div
        className="relative flex w-full max-w-[620px] flex-col rounded-[24px] border border-white/12 bg-[#12141c]/95 p-6 shadow-2xl backdrop-blur-2xl"
        onClick={(e) => {
          e.stopPropagation();
          setPresetMenuOpen(false);
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white shadow-sm">
              <Sliders size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-wide">Audio Equalizer & FX</h2>
              <p className="text-xs text-white/50">10-band studio frequency control & dynamics</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
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

        {/* Toolbar: Presets Menu & Loudness Normalizer */}
        <div className="mt-4 flex items-center justify-between gap-3">
          {/* Preset Selector Dropdown */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPresetMenuOpen(!presetMenuOpen);
              }}
              className="h-8 px-3 rounded-[12px] bg-white/[0.07] border border-white/10 hover:bg-white/[0.12] text-white text-xs font-medium flex items-center gap-2 transition-all shadow-sm cursor-pointer"
            >
              {isHeadphonePreset ? <Headphones size={13} className="text-emerald-400" /> : <Sliders size={13} className="text-white/60" />}
              <span className="text-white/50">{isHeadphonePreset ? 'AutoEq:' : 'Preset:'}</span>
              <span className="font-semibold text-white max-w-[130px] truncate">{currentPresetName}</span>
              <ChevronDown size={14} className="text-white/60" />
            </button>

            {presetMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setPresetMenuOpen(false)}
                />
                <div
                  className="absolute left-0 top-10 z-50 w-80 rounded-2xl border border-white/10 bg-[#161922]/98 p-2.5 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Category Tabs */}
                  <div className="flex rounded-xl bg-white/[0.06] p-0.5 mb-2.5">
                    <button
                      type="button"
                      onClick={() => setPresetTab('genre')}
                      className={`flex-1 py-1 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        presetTab === 'genre'
                          ? 'bg-white/15 text-white shadow-sm'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      <Music size={12} />
                      <span>Genre</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPresetTab('headphone')}
                      className={`flex-1 py-1 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                        presetTab === 'headphone'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                          : 'text-white/60 hover:text-white'
                      }`}
                    >
                      <Headphones size={12} />
                      <span>AutoEq Headphones</span>
                    </button>
                  </div>

                  {/* Genre Presets */}
                  {presetTab === 'genre' && (
                    <div className="space-y-1">
                      {EQ_PRESETS.map((p) => {
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
                              isSelected
                                ? 'bg-white/15 text-white font-medium'
                                : 'text-white/70 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <span>{p.name}</span>
                            {isSelected && <Check size={14} className="text-white" />}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* AutoEq Headphone Profiles */}
                  {presetTab === 'headphone' && (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-2 text-white/40" />
                        <input
                          type="text"
                          value={eqSearch}
                          onChange={(e) => setEqSearch(e.target.value)}
                          placeholder="Search Sony, AirPods, HD 600..."
                          className="w-full h-7 bg-white/[0.06] border border-white/10 rounded-lg pl-7 pr-2 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>

                      {/* Brand Pills */}
                      <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar text-[10px]">
                        {['All', 'Apple', 'Sony', 'Sennheiser', 'Samsung', 'Bose', 'Beyerdynamic', 'Moondrop'].map((b) => (
                          <button
                            key={b}
                            type="button"
                            onClick={() => setSelectedBrand(b)}
                            className={`px-2 py-0.5 rounded-md font-medium whitespace-nowrap transition-colors cursor-pointer ${
                              selectedBrand === b
                                ? 'bg-emerald-500/30 text-emerald-300 font-bold'
                                : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'
                            }`}
                          >
                            {b}
                          </button>
                        ))}
                      </div>

                      {/* Headphone list */}
                      <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
                        {AUTOEQ_PROFILES.filter((p) => {
                          const matchesBrand = selectedBrand === 'All' || p.brand?.toLowerCase() === selectedBrand.toLowerCase();
                          const matchesSearch =
                            !eqSearch.trim() ||
                            p.name.toLowerCase().includes(eqSearch.toLowerCase()) ||
                            p.brand?.toLowerCase().includes(eqSearch.toLowerCase());
                          return matchesBrand && matchesSearch;
                        }).map((p) => {
                          const isSelected = preset === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setPreset(p.id);
                                setPresetMenuOpen(false);
                              }}
                              className={`w-full p-2 rounded-xl text-left transition-colors flex items-center justify-between gap-2 cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-200'
                                  : 'hover:bg-white/10 text-white/80'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold truncate flex items-center gap-1.5">
                                  <span>{p.name}</span>
                                  <span className="text-[9px] px-1 py-0.2 rounded bg-white/10 text-white/60 font-normal">
                                    {p.brand}
                                  </span>
                                </div>
                                {p.description && (
                                  <div className="text-[10px] text-white/45 truncate mt-0.5">
                                    {p.description}
                                  </div>
                                )}
                              </div>
                              {isSelected && <Check size={14} className="text-emerald-400 flex-none" />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Loudness Normalizer Toggle */}
          <div className="flex items-center gap-2.5 rounded-[12px] bg-white/[0.05] border border-white/10 px-3 h-8">
            <Volume2 size={14} className={normalization ? 'text-white' : 'text-white/50'} />
            <span className="text-xs text-white/80 font-medium">Loudness Normalizer</span>
            <AppleToggle checked={normalization} onChange={setNormalization} label="Toggle Loudness Normalizer" />
          </div>
        </div>

        {/* Studio Graphic EQ Faders Grid */}
        <div className="relative mt-4 rounded-2xl bg-black/45 p-4 border border-white/5 select-none">
          {/* Y-Axis Guidelines & Scale */}
          <div className="pointer-events-none absolute left-3 right-3 top-7 bottom-10 flex flex-col justify-between">
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
          <div className="relative z-1 flex items-stretch justify-between h-52 pl-12 pr-2 gap-1.5">
            {EQ_FREQUENCIES.map((freq, i) => {
              const gain = bands[i] ?? 0;
              const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
              // Percentage from bottom (0 to 100%)
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
                      !isZero && eqEnabled ? 'text-white font-semibold' : 'text-white/35'
                    }`}
                  >
                    {gain > 0 ? `+${gain}` : gain}
                  </span>

                  {/* Interactive Fader Track Area */}
                  <div
                    onPointerDown={(e) => handleFaderStart(i, e)}
                    onDoubleClick={() => setBandGain(i, 0)}
                    className="relative flex-1 w-full flex items-center justify-center cursor-pointer py-1"
                    title={`${label}Hz: ${gain > 0 ? `+${gain}` : gain} dB (Double-click to reset)`}
                  >
                    {/* Background Slot */}
                    <div className="relative h-full w-[4px] bg-white/10 rounded-full overflow-hidden">
                      {/* Active level fill from center 0dB line */}
                      {eqEnabled && (
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
                        eqEnabled
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
              onClick={resetEq}
              className="flex items-center gap-1.5 rounded-[12px] px-3 py-1.5 text-xs text-white/50 hover:bg-white/5 hover:text-white transition-colors"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
            <span className="text-[11px] text-white/30 hidden sm:inline">
              Double-click any fader to zero
            </span>
          </div>

          <button
            onClick={() => setModalOpen(false)}
            className="rounded-[20px] h-8 px-6 bg-white text-xs font-semibold text-black hover:bg-white/90 active:scale-95 transition-all shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

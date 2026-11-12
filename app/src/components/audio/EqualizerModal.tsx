import { useState, useRef } from 'react';
import { useAudioFx, EQ_FREQUENCIES, EQ_PRESETS } from '@/state/audioFx';
import { X, Sliders, Volume2, RotateCcw, ChevronDown, Check } from 'lucide-react';

function AppleToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label?: string;
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
        width: '40px',
        height: '24px',
        padding: '2px',
        borderRadius: '9999px',
        backgroundColor: checked ? '#34c759' : 'rgba(255, 255, 255, 0.16)',
        border: 'none',
        outline: 'none',
        cursor: 'pointer',
        boxSizing: 'border-box',
        transition: 'background-color 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s ease',
        boxShadow: checked ? '0 0 10px rgba(52, 199, 89, 0.45)' : 'inset 0 0 0 1px rgba(255, 255, 255, 0.12)',
        flexShrink: 0,
        userSelect: 'none',
        verticalAlign: 'middle',
      }}
    >
      <span
        style={{
          display: 'block',
          width: '20px',
          height: '20px',
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
  const activeFaderRef = useRef<number | null>(null);

  if (!modalOpen) return null;

  const currentPresetName =
    EQ_PRESETS.find((p) => p.id === preset)?.name ?? (preset === 'custom' ? 'Custom' : 'Flat');

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
            <div className="flex items-center gap-2.5">
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
              className="h-8 px-3 rounded-[12px] bg-white/[0.07] border border-white/10 hover:bg-white/[0.12] text-white text-xs font-medium flex items-center gap-2 transition-all shadow-sm"
            >
              <span className="text-white/50">Preset:</span>
              <span className="font-semibold text-white">{currentPresetName}</span>
              <ChevronDown size={14} className="text-white/60" />
            </button>

            {presetMenuOpen && (
              <div
                className="absolute left-0 top-10 z-50 w-44 rounded-2xl border border-white/10 bg-[#161922]/98 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                {EQ_PRESETS.map((p) => {
                  const isSelected = preset === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setPreset(p.id);
                        setPresetMenuOpen(false);
                      }}
                      className={`w-full h-8 px-2.5 rounded-xl text-xs flex items-center justify-between transition-colors ${
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

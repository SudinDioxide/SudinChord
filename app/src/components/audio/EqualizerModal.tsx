import { useAudioFx, EQ_FREQUENCIES, EQ_PRESETS } from '@/state/audioFx';
import { X, Sliders, Volume2, RotateCcw } from 'lucide-react';

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

  if (!modalOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/65 p-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={() => setModalOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Audio Equalizer & FX"
    >
      <div
        className="relative flex w-full max-w-[640px] flex-col rounded-[24px] border border-white/12 bg-[#12141c]/95 p-6 shadow-2xl backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white shadow-sm">
              <Sliders size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-wide">Audio Equalizer & FX</h2>
              <p className="text-xs text-white/50">Tune frequency response and dynamic range</p>
            </div>
          </div>
          <button
            onClick={() => setModalOpen(false)}
            aria-label="Close"
            className="flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Top Controls: Equalizer & Loudness Normalizer Toggles */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          {/* EQ Switch */}
          <div className="flex items-center justify-between rounded-2xl bg-white/[0.04] p-3.5 border border-white/5">
            <div>
              <span className="text-sm font-medium text-white block">Equalizer</span>
              <span className="text-xs text-white/40">{eqEnabled ? 'Active' : 'Bypassed'}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={eqEnabled}
              onClick={() => setEqEnabled(!eqEnabled)}
              className={`relative h-6 w-11 rounded-full p-0.5 border transition-all ${
                eqEnabled
                  ? 'bg-primary border-primary/50 shadow-[0_0_12px_rgba(255,0,51,0.35)]'
                  : 'bg-white/15 border-white/10'
              }`}
            >
              <span
                className={`block size-4.5 rounded-full bg-white shadow-md transition-transform ${
                  eqEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Normalizer Switch */}
          <div className="flex items-center justify-between rounded-2xl bg-white/[0.04] p-3.5 border border-white/5">
            <div className="flex items-center gap-2.5">
              <Volume2 size={16} className="text-white/60" />
              <div>
                <span className="text-sm font-medium text-white block">Loudness Normalizer</span>
                <span className="text-xs text-white/40">{normalization ? 'Equalized' : 'Raw'}</span>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={normalization}
              onClick={() => setNormalization(!normalization)}
              className={`relative h-6 w-11 rounded-full p-0.5 border transition-all ${
                normalization
                  ? 'bg-primary border-primary/50 shadow-[0_0_12px_rgba(255,0,51,0.35)]'
                  : 'bg-white/15 border-white/10'
              }`}
            >
              <span
                className={`block size-4.5 rounded-full bg-white shadow-md transition-transform ${
                  normalization ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Presets Bar */}
        <div className="mt-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-white/40 block mb-2">Presets</span>
          <div className="flex flex-wrap gap-2">
            {EQ_PRESETS.map((p) => {
              const active = preset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id)}
                  className={`h-7 px-3.5 rounded-[14px] text-xs font-medium transition-all inline-flex items-center justify-center ${
                    active
                      ? 'bg-white text-black font-semibold shadow-md shadow-white/10'
                      : 'bg-white/[0.05] border border-white/5 text-white/75 hover:bg-white/[0.1] hover:text-white'
                  }`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* 10-Band Sliders Grid */}
        <div className="relative mt-5 rounded-2xl bg-black/40 p-4 border border-white/5">
          {/* Subtle 0 dB Center Reference Guideline */}
          <div className="pointer-events-none absolute left-6 right-6 top-[50%] h-[1px] border-b border-dashed border-white/15 z-0" />
          <span className="pointer-events-none absolute left-2 top-[47%] text-[9px] font-mono text-white/30 z-0">0dB</span>

          <div className="relative z-1 flex items-end justify-between h-48 px-4 gap-2">
            {EQ_FREQUENCIES.map((freq, i) => {
              const gain = bands[i] ?? 0;
              const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
              return (
                <div key={freq} className="flex flex-1 flex-col items-center h-full justify-between">
                  {/* Gain readout */}
                  <span className={`text-[10px] font-mono transition-colors ${gain !== 0 ? 'text-white font-semibold' : 'text-white/40'}`}>
                    {gain > 0 ? `+${gain}` : gain}
                  </span>

                  {/* Vertical Slider Track Container */}
                  <div className="relative flex-1 flex items-center justify-center my-1 w-full">
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={1}
                      value={gain}
                      disabled={!eqEnabled}
                      onChange={(e) => setBandGain(i, parseFloat(e.target.value))}
                      className="h-32 w-1.5 appearance-none bg-white/15 rounded-full cursor-pointer accent-white [writing-mode:vertical-lr] [direction:rtl] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/25 transition-colors"
                      title={`${label}Hz: ${gain > 0 ? `+${gain}` : gain} dB`}
                    />
                  </div>

                  {/* Frequency label */}
                  <span className="text-[10px] font-medium text-white/60 tracking-tight">{label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-between pt-1">
          <button
            onClick={resetEq}
            className="flex items-center gap-1.5 rounded-[14px] px-3 py-1.5 text-xs text-white/50 hover:bg-white/5 hover:text-white transition-colors"
          >
            <RotateCcw size={13} />
            <span>Reset to Flat</span>
          </button>
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

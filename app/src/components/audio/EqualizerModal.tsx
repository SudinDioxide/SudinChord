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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md animate-in fade-in duration-200"
      onClick={() => setModalOpen(false)}
    >
      <div
        className="relative flex w-full max-w-[620px] flex-col rounded-[24px] border border-white/10 bg-[#12141c]/95 p-6 shadow-2xl backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-white/10 text-white">
              <Sliders size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white tracking-wide">Audio Equalizer & FX</h2>
              <p className="text-xs text-white/50">Tune frequency response and dynamic range</p>
            </div>
          </div>
          <button
            onClick={() => setModalOpen(false)}
            className="flex size-8 items-center justify-center rounded-full text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Top Controls: EQ Enable & Normalization Toggles */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="flex items-center justify-between rounded-xl bg-white/[0.04] p-3.5 border border-white/5">
            <div>
              <span className="text-sm font-medium text-white block">Equalizer</span>
              <span className="text-xs text-white/40">{eqEnabled ? 'Active' : 'Bypassed'}</span>
            </div>
            <button
              onClick={() => setEqEnabled(!eqEnabled)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                eqEnabled ? 'bg-primary' : 'bg-white/20'
              }`}
            >
              <span
                className={`absolute top-1 left-1 size-4 rounded-full bg-white transition-transform ${
                  eqEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-white/[0.04] p-3.5 border border-white/5">
            <div className="flex items-center gap-2">
              <Volume2 size={16} className="text-white/60" />
              <div>
                <span className="text-sm font-medium text-white block">Loudness Normalizer</span>
                <span className="text-xs text-white/40">{normalization ? 'Equalized' : 'Raw'}</span>
              </div>
            </div>
            <button
              onClick={() => setNormalization(!normalization)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                normalization ? 'bg-primary' : 'bg-white/20'
              }`}
            >
              <span
                className={`absolute top-1 left-1 size-4 rounded-full bg-white transition-transform ${
                  normalization ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Presets Bar */}
        <div className="mt-5">
          <span className="text-xs font-semibold uppercase tracking-wider text-white/40 block mb-2">Presets</span>
          <div className="flex flex-wrap gap-1.5">
            {EQ_PRESETS.map((p) => {
              const active = preset === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                    active
                      ? 'bg-white text-black shadow-sm'
                      : 'bg-white/[0.06] text-white/70 hover:bg-white/[0.12] hover:text-white'
                  }`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* 10-Band Sliders Grid */}
        <div className="mt-6 rounded-2xl bg-black/30 p-4 border border-white/5">
          <div className="flex items-end justify-between h-44 px-1 gap-2">
            {EQ_FREQUENCIES.map((freq, i) => {
              const gain = bands[i] ?? 0;
              const label = freq >= 1000 ? `${freq / 1000}k` : `${freq}`;
              return (
                <div key={freq} className="flex flex-1 flex-col items-center h-full justify-between">
                  <span className="text-[10px] font-mono text-white/50">
                    {gain > 0 ? `+${gain}` : gain}
                  </span>
                  <div className="relative flex-1 flex items-center justify-center my-1 w-full">
                    <input
                      type="range"
                      min={-12}
                      max={12}
                      step={1}
                      value={gain}
                      disabled={!eqEnabled}
                      onChange={(e) => setBandGain(i, parseFloat(e.target.value))}
                      className="h-28 w-1 appearance-none bg-white/20 rounded-full cursor-pointer accent-white [writing-mode:vertical-lr] [direction:rtl] disabled:opacity-30 disabled:cursor-not-allowed"
                    />
                  </div>
                  <span className="text-[10px] font-medium text-white/60">{label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 flex items-center justify-between pt-2">
          <button
            onClick={resetEq}
            className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
          >
            <RotateCcw size={14} />
            <span>Reset to Flat</span>
          </button>
          <button
            onClick={() => setModalOpen(false)}
            className="rounded-full bg-white px-5 py-1.5 text-xs font-semibold text-black hover:bg-white/90 transition-colors shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

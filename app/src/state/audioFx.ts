import { create } from 'zustand';

export const EQ_FREQUENCIES = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export interface EqPreset {
  id: string;
  name: string;
  gains: number[];
}

export const EQ_PRESETS: EqPreset[] = [
  { id: 'flat', name: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { id: 'bass-boost', name: 'Bass Boost', gains: [6, 5, 4, 2, 0, 0, 0, 0, 1, 1] },
  { id: 'treble-boost', name: 'Treble Boost', gains: [0, 0, 0, 0, 1, 2, 3, 5, 6, 7] },
  { id: 'vocal', name: 'Vocal Booster', gains: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1] },
  { id: 'electronic', name: 'Electronic', gains: [4, 3, 1, 0, -1, 1, 2, 3, 4, 4] },
  { id: 'rock', name: 'Rock', gains: [4, 3, 1, -1, -2, 0, 2, 3, 4, 5] },
  { id: 'acoustic', name: 'Acoustic', gains: [3, 2, 1, 1, 2, 2, 3, 3, 2, 2] },
];

const STORAGE_KEY = 'sudinchord:audio-fx:v1';

interface SavedFxState {
  eqEnabled: boolean;
  preset: string;
  bands: number[];
  normalization: boolean;
}

function loadSavedState(): SavedFxState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        eqEnabled: typeof parsed.eqEnabled === 'boolean' ? parsed.eqEnabled : false,
        preset: parsed.preset || 'flat',
        bands: Array.isArray(parsed.bands) && parsed.bands.length === 10 ? parsed.bands : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        normalization: typeof parsed.normalization === 'boolean' ? parsed.normalization : true,
      };
    }
  } catch {}
  return {
    eqEnabled: false,
    preset: 'flat',
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    normalization: true,
  };
}

export interface AudioFxState {
  eqEnabled: boolean;
  preset: string;
  bands: number[];
  normalization: boolean;
  modalOpen: boolean;

  setEqEnabled: (enabled: boolean) => void;
  setBandGain: (index: number, gain: number) => void;
  setPreset: (presetId: string) => void;
  setNormalization: (enabled: boolean) => void;
  setModalOpen: (open: boolean) => void;
  resetEq: () => void;
}

const saved = loadSavedState();

export const useAudioFx = create<AudioFxState>((set, get) => ({
  eqEnabled: saved.eqEnabled,
  preset: saved.preset,
  bands: saved.bands,
  normalization: saved.normalization,
  modalOpen: false,

  setEqEnabled(eqEnabled) {
    set({ eqEnabled });
    persist(get());
    syncAudioGraph();
  },

  setBandGain(index, gain) {
    const bands = [...get().bands];
    bands[index] = Math.max(-12, Math.min(12, gain));
    set({ bands, preset: 'custom' });
    persist(get());
    syncAudioGraph();
  },

  setPreset(presetId) {
    const p = EQ_PRESETS.find((x) => x.id === presetId);
    if (!p) return;
    set({ preset: p.id, bands: [...p.gains], eqEnabled: true });
    persist(get());
    syncAudioGraph();
  },

  setNormalization(normalization) {
    set({ normalization });
    persist(get());
    syncAudioGraph();
  },

  setModalOpen(modalOpen) {
    set({ modalOpen });
  },

  resetEq() {
    set({ preset: 'flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
    persist(get());
    syncAudioGraph();
  },
}));

function persist(state: AudioFxState) {
  try {
    const payload: SavedFxState = {
      eqEnabled: state.eqEnabled,
      preset: state.preset,
      bands: state.bands,
      normalization: state.normalization,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

let activeGraphRef: {
  ctx: AudioContext;
  eqFilters: BiquadFilterNode[];
  compressor: DynamicsCompressorNode;
} | null = null;

export function registerGraphForFx(graph: {
  ctx: AudioContext;
  eqFilters: BiquadFilterNode[];
  compressor: DynamicsCompressorNode;
}) {
  activeGraphRef = graph;
  syncAudioGraph();
}

export function syncAudioGraph() {
  if (!activeGraphRef) return;
  const { eqEnabled, bands, normalization } = useAudioFx.getState();
  const { ctx, eqFilters, compressor } = activeGraphRef;
  const now = ctx.currentTime;

  eqFilters.forEach((filter, idx) => {
    const targetGain = eqEnabled ? (bands[idx] ?? 0) : 0;
    try {
      filter.gain.setTargetAtTime(targetGain, now, 0.02);
    } catch {
      filter.gain.value = targetGain;
    }
  });

  try {
    // Enable compressor threshold or bypass by setting to 0dB
    const targetThreshold = normalization ? -24 : 0;
    compressor.threshold.setTargetAtTime(targetThreshold, now, 0.05);
  } catch {
    compressor.threshold.value = normalization ? -24 : 0;
  }
}


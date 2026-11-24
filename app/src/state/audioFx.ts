import { create } from 'zustand';

export const EQ_FREQUENCIES = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

/** Tuned musical Q factors for studio precision and warmth without muddy frequency bleeding. */
export const EQ_Q_VALUES = [0, 2.0, 1.8, 1.5, 1.4, 1.2, 1.2, 1.2, 1.3, 0] as const;

export interface EqPreset {
  id: string;
  name: string;
  gains: number[];
  category?: 'General' | 'Genre' | 'Acoustic' | 'Custom';
}

export const EQ_PRESETS: EqPreset[] = [
  { id: 'flat', name: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], category: 'General' },
  { id: 'bass-boost', name: 'Bass Boost', gains: [6.5, 5.5, 4, 2, 0, 0, 0, 0, 1, 1], category: 'Acoustic' },
  { id: 'deep-sub', name: 'Deep Sub-Bass', gains: [8, 7, 4, 1, -1, -1, 0, 0, 0, 0], category: 'Acoustic' },
  { id: 'treble-boost', name: 'Treble Boost', gains: [0, 0, 0, 0, 1, 2, 3.5, 5.5, 7, 7.5], category: 'Acoustic' },
  { id: 'vocal', name: 'Vocal Clarity', gains: [-2.5, -1, 0.5, 2.5, 4.5, 4.5, 3.5, 1.5, 0, -1], category: 'Acoustic' },
  { id: 'hip-hop', name: 'Hip-Hop / Trap', gains: [6, 5, 2.5, 0, -1.5, 1, 2, 2.5, 3.5, 4], category: 'Genre' },
  { id: 'club-dance', name: 'Club / Dance', gains: [5.5, 4.5, 2, 0, 1, 2, 3, 3.5, 4, 3.5], category: 'Genre' },
  { id: 'electronic', name: 'Electronic', gains: [4.5, 3.5, 1, 0, -1, 1, 2.5, 3.5, 4.5, 4.5], category: 'Genre' },
  { id: 'rock', name: 'Rock / Metal', gains: [4.5, 3.5, 1.5, -1, -2, 0.5, 2.5, 3.5, 4.5, 5], category: 'Genre' },
  { id: 'pop', name: 'Pop', gains: [2, 3, 4, 2, -1, -1, 1.5, 3, 3.5, 4], category: 'Genre' },
  { id: 'r-and-b', name: 'R&B', gains: [5, 4, 2, 1, -0.5, 1.5, 2, 2.5, 3, 3.5], category: 'Genre' },
  { id: 'jazz', name: 'Jazz', gains: [3, 2, 1, 1.5, 2, 2, 1.5, 2, 2.5, 3], category: 'Genre' },
  { id: 'classical', name: 'Classical', gains: [4, 3, 2, 1.5, -1, -1, 0, 2, 3, 3.5], category: 'Genre' },
  { id: 'acoustic', name: 'Acoustic', gains: [3.5, 2.5, 1, 1, 2, 2, 3, 3, 2.5, 2], category: 'Genre' },
  { id: 'spoken-word', name: 'Spoken Word / Podcast', gains: [-4, -2, 0, 2, 4, 4, 3, 1, -1, -3], category: 'Acoustic' },
  { id: 'late-night', name: 'Late Night Quiet', gains: [2.5, 1.5, 0, -2, -2, -1, 0, 1, 0.5, 0], category: 'Acoustic' },
];

const STORAGE_KEY = 'sudinchord:audio-fx:v2';
const LEGACY_STORAGE_KEY = 'sudinchord:audio-fx:v1';

interface SavedFxState {
  eqEnabled: boolean;
  preset: string;
  bands: number[];
  preamp: number;
  autoHeadroom: boolean;
  customPresets: EqPreset[];
  normalization: boolean;
}

function loadSavedState(): SavedFxState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        eqEnabled: typeof parsed.eqEnabled === 'boolean' ? parsed.eqEnabled : false,
        preset: parsed.preset || 'flat',
        bands: Array.isArray(parsed.bands) && parsed.bands.length === 10 ? parsed.bands : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        preamp: typeof parsed.preamp === 'number' ? Math.max(-12, Math.min(12, parsed.preamp)) : 0,
        autoHeadroom: typeof parsed.autoHeadroom === 'boolean' ? parsed.autoHeadroom : true,
        customPresets: Array.isArray(parsed.customPresets) ? parsed.customPresets : [],
        normalization: typeof parsed.normalization === 'boolean' ? parsed.normalization : true,
      };
    }
  } catch {}
  return {
    eqEnabled: false,
    preset: 'flat',
    bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    preamp: 0,
    autoHeadroom: true,
    customPresets: [],
    normalization: true,
  };
}

export interface AudioFxState {
  eqEnabled: boolean;
  preset: string;
  bands: number[];
  preamp: number;
  autoHeadroom: boolean;
  customPresets: EqPreset[];
  abComparing: boolean;
  normalization: boolean;
  modalOpen: boolean;

  setEqEnabled: (enabled: boolean) => void;
  setBandGain: (index: number, gain: number) => void;
  setBands: (bands: number[]) => void;
  setPreamp: (gain: number) => void;
  setAutoHeadroom: (enabled: boolean) => void;
  setPreset: (presetId: string) => void;
  saveCustomPreset: (name: string) => void;
  deleteCustomPreset: (id: string) => void;
  toggleAB: () => void;
  setNormalization: (enabled: boolean) => void;
  setModalOpen: (open: boolean) => void;
  resetEq: () => void;
}

const saved = loadSavedState();

export const useAudioFx = create<AudioFxState>((set, get) => ({
  eqEnabled: saved.eqEnabled,
  preset: saved.preset,
  bands: saved.bands,
  preamp: saved.preamp,
  autoHeadroom: saved.autoHeadroom,
  customPresets: saved.customPresets,
  abComparing: false,
  normalization: saved.normalization,
  modalOpen: false,

  setEqEnabled(eqEnabled) {
    set({ eqEnabled });
    persist(get());
    syncAudioGraph();
  },

  setBandGain(index, gain) {
    const bands = [...get().bands];
    bands[index] = Math.max(-12, Math.min(12, Math.round(gain * 2) / 2));
    set({ bands, preset: 'custom' });
    persist(get());
    syncAudioGraph();
  },

  setBands(bands) {
    if (bands.length !== 10) return;
    const clamped = bands.map((g) => Math.max(-12, Math.min(12, Math.round(g * 2) / 2)));
    set({ bands: clamped, preset: 'custom' });
    persist(get());
    syncAudioGraph();
  },

  setPreamp(preamp) {
    const clamped = Math.max(-12, Math.min(12, Math.round(preamp * 2) / 2));
    set({ preamp: clamped });
    persist(get());
    syncAudioGraph();
  },

  setAutoHeadroom(autoHeadroom) {
    set({ autoHeadroom });
    persist(get());
    syncAudioGraph();
  },

  setPreset(presetId) {
    const allPresets = [...EQ_PRESETS, ...get().customPresets];
    const p = allPresets.find((x) => x.id === presetId);
    if (!p) return;
    set({ preset: p.id, bands: [...p.gains], eqEnabled: true, abComparing: false });
    persist(get());
    syncAudioGraph();
  },

  saveCustomPreset(name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const newPreset: EqPreset = {
      id: `custom-${Date.now()}`,
      name: trimmed,
      gains: [...get().bands],
      category: 'Custom',
    };
    const customPresets = [...get().customPresets.filter((p) => p.name.toLowerCase() !== trimmed.toLowerCase()), newPreset];
    set({ customPresets, preset: newPreset.id });
    persist(get());
  },

  deleteCustomPreset(id) {
    const customPresets = get().customPresets.filter((p) => p.id !== id);
    const preset = get().preset === id ? 'custom' : get().preset;
    set({ customPresets, preset });
    persist(get());
  },

  toggleAB() {
    set((s) => ({ abComparing: !s.abComparing }));
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
    set({ preset: 'flat', bands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], preamp: 0, abComparing: false });
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
      preamp: state.preamp,
      autoHeadroom: state.autoHeadroom,
      customPresets: state.customPresets,
      normalization: state.normalization,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

let activeGraphRef: {
  ctx: AudioContext;
  preamp?: GainNode;
  eqFilters: BiquadFilterNode[];
  compressor: DynamicsCompressorNode;
} | null = null;

export function registerGraphForFx(graph: {
  ctx: AudioContext;
  preamp?: GainNode;
  eqFilters: BiquadFilterNode[];
  compressor: DynamicsCompressorNode;
}) {
  activeGraphRef = graph;
  syncAudioGraph();
}

/** Calculates automatic anti-clipping headroom attenuation in dB based on highest boosted band. */
export function calculateAutoHeadroomDb(bands: number[], preamp: number, autoHeadroom: boolean): number {
  if (!autoHeadroom) return 0;
  const maxBoost = Math.max(0, ...bands);
  const totalBoost = maxBoost + Math.max(0, preamp);
  return totalBoost > 0 ? -totalBoost : 0;
}

export function syncAudioGraph() {
  if (!activeGraphRef) return;
  const { eqEnabled, bands, preamp, autoHeadroom, abComparing, normalization } = useAudioFx.getState();
  const { ctx, preamp: preampNode, eqFilters, compressor } = activeGraphRef;
  const now = ctx.currentTime;

  const isBypassed = !eqEnabled || abComparing;

  // 1. Sync Preamp Gain with anti-clipping headroom
  if (preampNode) {
    const headroomDb = calculateAutoHeadroomDb(bands, preamp, autoHeadroom);
    const effectivePreampDb = isBypassed ? 0 : preamp + headroomDb;
    const linearGain = Math.max(0.0001, Math.pow(10, effectivePreampDb / 20));
    try {
      preampNode.gain.setTargetAtTime(linearGain, now, 0.02);
    } catch {
      preampNode.gain.value = linearGain;
    }
  }

  // 2. Sync Biquad EQ Filters
  eqFilters.forEach((filter, idx) => {
    const targetGain = isBypassed ? 0 : (bands[idx] ?? 0);
    try {
      filter.gain.setTargetAtTime(targetGain, now, 0.02);
    } catch {
      filter.gain.value = targetGain;
    }
  });

  // 3. Sync Loudness Normalization Dynamics Compressor
  try {
    const targetThreshold = normalization ? -24 : 0;
    compressor.threshold.setTargetAtTime(targetThreshold, now, 0.05);
  } catch {
    compressor.threshold.value = normalization ? -24 : 0;
  }
}

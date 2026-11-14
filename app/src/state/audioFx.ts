import { create } from 'zustand';

export const EQ_FREQUENCIES = [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export interface EqPreset {
  id: string;
  name: string;
  gains: number[];
  category?: 'genre' | 'headphone';
  brand?: string;
  description?: string;
}

export const EQ_PRESETS: EqPreset[] = [
  { id: 'flat', name: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], category: 'genre' },
  { id: 'bass-boost', name: 'Bass Boost', gains: [6, 5, 4, 2, 0, 0, 0, 0, 1, 1], category: 'genre' },
  { id: 'treble-boost', name: 'Treble Boost', gains: [0, 0, 0, 0, 1, 2, 3, 5, 6, 7], category: 'genre' },
  { id: 'vocal', name: 'Vocal Booster', gains: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1], category: 'genre' },
  { id: 'electronic', name: 'Electronic', gains: [4, 3, 1, 0, -1, 1, 2, 3, 4, 4], category: 'genre' },
  { id: 'rock', name: 'Rock', gains: [4, 3, 1, -1, -2, 0, 2, 3, 4, 5], category: 'genre' },
  { id: 'acoustic', name: 'Acoustic', gains: [3, 2, 1, 1, 2, 2, 3, 3, 2, 2], category: 'genre' },
];

export const AUTOEQ_PROFILES: EqPreset[] = [
  // Apple
  {
    id: 'autoeq-airpods-pro-2',
    name: 'AirPods Pro 2',
    brand: 'Apple',
    category: 'headphone',
    description: 'Harman In-Ear Target: Tightens bass and smooths upper midrange',
    gains: [-1, 0, 0, 1, 0, -1, 2, 4, 1, -2],
  },
  {
    id: 'autoeq-airpods-pro',
    name: 'AirPods Pro',
    brand: 'Apple',
    category: 'headphone',
    description: 'Harman In-Ear Target: Compensates 4kHz-8kHz presence region',
    gains: [-1, 0, 0, 1, 1, 0, 2, 5, 0, -3],
  },
  {
    id: 'autoeq-airpods-max',
    name: 'AirPods Max',
    brand: 'Apple',
    category: 'headphone',
    description: 'Harman Over-Ear Target: Cleans upper bass bloat and elevates clarity',
    gains: [0, -1, -2, -1, 0, 1, 2, 3, -1, -2],
  },
  {
    id: 'autoeq-airpods-3',
    name: 'AirPods 3',
    brand: 'Apple',
    category: 'headphone',
    description: 'Harman Target: Compensates open-ear bass rolloff',
    gains: [4, 3, 1, 0, -1, 1, 2, 1, 0, -1],
  },
  // Sony
  {
    id: 'autoeq-sony-wh1000xm4',
    name: 'WH-1000XM4',
    brand: 'Sony',
    category: 'headphone',
    description: 'Harman Target: Controls boomy mid-bass and lifts recessed treble detail',
    gains: [-4, -3, -2, -1, 1, 2, 2, 3, -1, -2],
  },
  {
    id: 'autoeq-sony-wh1000xm5',
    name: 'WH-1000XM5',
    brand: 'Sony',
    category: 'headphone',
    description: 'Harman Target: Neutralizes dark warmth for clearer instruments',
    gains: [-2, -2, -1, 0, 1, 1, 3, 2, 0, -1],
  },
  {
    id: 'autoeq-sony-wf1000xm4',
    name: 'WF-1000XM4 (In-Ear)',
    brand: 'Sony',
    category: 'headphone',
    description: 'Harman In-Ear Target: Clarifies 1kHz-4kHz and sparkles top octave',
    gains: [-1, -2, -1, 0, 1, 2, 2, 1, 3, 1],
  },
  {
    id: 'autoeq-sony-wf1000xm5',
    name: 'WF-1000XM5 (In-Ear)',
    brand: 'Sony',
    category: 'headphone',
    description: 'Harman In-Ear Target: Balanced reference tuning',
    gains: [-1, -1, 0, 0, 1, 1, 2, 2, 1, -1],
  },
  // Sennheiser
  {
    id: 'autoeq-sennheiser-hd600',
    name: 'HD 600',
    brand: 'Sennheiser',
    category: 'headphone',
    description: 'Harman Target: Extends sub-bass rolloff and refines 3kHz forwardness',
    gains: [6, 4, 2, 0, 0, 0, -1, 2, -1, -3],
  },
  {
    id: 'autoeq-sennheiser-hd650',
    name: 'HD 650 / HD 6XX',
    brand: 'Sennheiser',
    category: 'headphone',
    description: 'Harman Target: Lifts sub-bass and adds air to the top end',
    gains: [6, 5, 2, 0, 0, 0, 0, 2, 1, -2],
  },
  {
    id: 'autoeq-sennheiser-hd560s',
    name: 'HD 560S',
    brand: 'Sennheiser',
    category: 'headphone',
    description: 'Harman Target: Adds sub-bass slam and smooths 4kHz-6kHz peak',
    gains: [4, 2, 1, 0, -1, 0, 1, -1, 2, 0],
  },
  {
    id: 'autoeq-sennheiser-momentum-4',
    name: 'Momentum 4',
    brand: 'Sennheiser',
    category: 'headphone',
    description: 'Harman Target: Tames bass emphasis and brightens mids',
    gains: [-3, -2, -1, 0, 1, 1, 2, 2, -1, -1],
  },
  // Samsung
  {
    id: 'autoeq-samsung-buds-2-pro',
    name: 'Galaxy Buds 2 Pro',
    brand: 'Samsung',
    category: 'headphone',
    description: 'Harman Target: Fine-tunes high treble and mid-bass balance',
    gains: [0, 1, 0, 0, 0, 0, 1, 2, -1, -1],
  },
  {
    id: 'autoeq-samsung-buds-pro',
    name: 'Galaxy Buds Pro',
    brand: 'Samsung',
    category: 'headphone',
    description: 'Harman Target: Smooths vocal bite and extends sub-bass',
    gains: [1, 0, 0, -1, 0, 1, 2, 1, 0, -1],
  },
  // Bose
  {
    id: 'autoeq-bose-qc45',
    name: 'QuietComfort 45 / QC35 II',
    brand: 'Bose',
    category: 'headphone',
    description: 'Harman Target: Neutralizes sharp 6kHz treble spike and warms mids',
    gains: [1, -1, -1, 0, 1, 2, 0, -3, 1, 0],
  },
  {
    id: 'autoeq-bose-qc-ultra',
    name: 'QuietComfort Ultra',
    brand: 'Bose',
    category: 'headphone',
    description: 'Harman Target: Refines upper treble detail and reduces lower bass',
    gains: [-1, -2, -1, 0, 1, 1, 1, 0, 2, 1],
  },
  // Beyerdynamic
  {
    id: 'autoeq-beyerdynamic-dt770',
    name: 'DT 770 Pro (80Ω)',
    brand: 'Beyerdynamic',
    category: 'headphone',
    description: 'Harman Target: Tames the sharp 6kHz-8kHz Beyer treble spike',
    gains: [1, 0, -1, 0, 1, 0, 0, -4, 2, -3],
  },
  {
    id: 'autoeq-beyerdynamic-dt990',
    name: 'DT 990 Pro',
    brand: 'Beyerdynamic',
    category: 'headphone',
    description: 'Harman Target: Calibrates aggressive V-shape into natural reference',
    gains: [4, 2, 0, 0, 1, 0, -1, -5, 0, -4],
  },
  // Audio-Technica
  {
    id: 'autoeq-ath-m50x',
    name: 'ATH-M50x',
    brand: 'Audio-Technica',
    category: 'headphone',
    description: 'Harman Target: Cleans up boxy mid-bass and extends high frequencies',
    gains: [-2, -1, 0, 0, 0, 1, -1, 1, -2, 1],
  },
  // Moondrop & Popular IEMs
  {
    id: 'autoeq-moondrop-chu-2',
    name: 'Chu / Chu II',
    brand: 'Moondrop',
    category: 'headphone',
    description: 'Harman In-Ear Target: Enhances sub-bass depth and relaxes upper mids',
    gains: [1, 0, 0, 0, 0, -1, 1, 3, -2, 2],
  },
  {
    id: 'autoeq-moondrop-aria',
    name: 'Aria',
    brand: 'Moondrop',
    category: 'headphone',
    description: 'Harman In-Ear Target: Lifts vocal presence and clarifies soundstage',
    gains: [0, 0, 0, 0, 1, 1, 2, 1, -1, 1],
  },
  {
    id: 'autoeq-7hz-zero',
    name: 'Salnotes Zero',
    brand: '7Hz',
    category: 'headphone',
    description: 'Harman In-Ear Target: Adds low-end punch to lean bass',
    gains: [2, 1, 0, 0, 0, 0, 1, 2, 1, -1],
  },
  // Hifiman Planar
  {
    id: 'autoeq-hifiman-sundara',
    name: 'Sundara (Planar)',
    brand: 'Hifiman',
    category: 'headphone',
    description: 'Harman Target: Imparts sub-bass slam to ultra-fast planar drivers',
    gains: [5, 3, 1, 0, 0, 0, 0, 1, 2, 0],
  },
];

export const ALL_PRESETS: EqPreset[] = [...EQ_PRESETS, ...AUTOEQ_PROFILES];

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
    const p = ALL_PRESETS.find((x) => x.id === presetId);
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


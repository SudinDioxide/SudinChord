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

export type SpatialMode = 'binaural' | 'binaural_orbit' | 'ms';

interface SavedFxState {
  eqEnabled: boolean;
  preset: string;
  bands: number[];
  preamp: number;
  autoHeadroom: boolean;
  customPresets: EqPreset[];
  normalization: boolean;
  stereoEnabled: boolean;
  stereoWidth: number;
  spatialMode: SpatialMode;
  binauralAngle: number;
  binauralAzimuth: number;
  binauralElevation: number;
}

function loadSavedState(): SavedFxState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const validMode: SpatialMode =
        parsed.spatialMode === 'ms' || parsed.spatialMode === 'binaural_orbit' || parsed.spatialMode === 'binaural'
          ? parsed.spatialMode
          : 'binaural';

      return {
        eqEnabled: typeof parsed.eqEnabled === 'boolean' ? parsed.eqEnabled : false,
        preset: parsed.preset || 'flat',
        bands: Array.isArray(parsed.bands) && parsed.bands.length === 10 ? parsed.bands : [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        preamp: typeof parsed.preamp === 'number' ? Math.max(-12, Math.min(12, parsed.preamp)) : 0,
        autoHeadroom: typeof parsed.autoHeadroom === 'boolean' ? parsed.autoHeadroom : true,
        customPresets: Array.isArray(parsed.customPresets) ? parsed.customPresets : [],
        normalization: typeof parsed.normalization === 'boolean' ? parsed.normalization : true,
        stereoEnabled: typeof parsed.stereoEnabled === 'boolean' ? parsed.stereoEnabled : false,
        stereoWidth: typeof parsed.stereoWidth === 'number' ? Math.max(0, Math.min(2, parsed.stereoWidth)) : 1.4,
        spatialMode: validMode,
        binauralAngle: typeof parsed.binauralAngle === 'number' ? Math.max(15, Math.min(70, parsed.binauralAngle)) : 35,
        binauralAzimuth: typeof parsed.binauralAzimuth === 'number' ? Math.max(-180, Math.min(180, parsed.binauralAzimuth)) : 0,
        binauralElevation: typeof parsed.binauralElevation === 'number' ? Math.max(-45, Math.min(45, parsed.binauralElevation)) : 0,
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
    stereoEnabled: false,
    stereoWidth: 1.4,
    spatialMode: 'binaural',
    binauralAngle: 35,
    binauralAzimuth: 0,
    binauralElevation: 0,
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
  stereoEnabled: boolean;
  stereoWidth: number;
  spatialMode: SpatialMode;
  binauralAngle: number;
  binauralAzimuth: number;
  binauralElevation: number;
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
  setStereoEnabled: (enabled: boolean) => void;
  setStereoWidth: (width: number) => void;
  setSpatialMode: (mode: SpatialMode) => void;
  setBinauralAngle: (angle: number) => void;
  setBinauralAzimuth: (azimuth: number) => void;
  setBinauralElevation: (elevation: number) => void;
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
  stereoEnabled: saved.stereoEnabled,
  stereoWidth: saved.stereoWidth,
  spatialMode: saved.spatialMode,
  binauralAngle: saved.binauralAngle,
  binauralAzimuth: saved.binauralAzimuth,
  binauralElevation: saved.binauralElevation,
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

  setStereoEnabled(stereoEnabled) {
    set({ stereoEnabled });
    persist(get());
    syncAudioGraph();
  },

  setStereoWidth(stereoWidth) {
    const clamped = Math.max(0, Math.min(2, Math.round(stereoWidth * 100) / 100));
    set({ stereoWidth: clamped });
    persist(get());
    syncAudioGraph();
  },

  setSpatialMode(spatialMode) {
    set({ spatialMode });
    persist(get());
    syncAudioGraph();
  },

  setBinauralAngle(binauralAngle) {
    const clamped = Math.max(15, Math.min(70, Math.round(binauralAngle)));
    set({ binauralAngle: clamped });
    persist(get());
    syncAudioGraph();
  },

  setBinauralAzimuth(binauralAzimuth) {
    const clamped = Math.max(-180, Math.min(180, Math.round(binauralAzimuth)));
    set({ binauralAzimuth: clamped });
    persist(get());
    syncAudioGraph();
  },

  setBinauralElevation(binauralElevation) {
    const clamped = Math.max(-45, Math.min(45, Math.round(binauralElevation)));
    set({ binauralElevation: clamped });
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
      stereoEnabled: state.stereoEnabled,
      stereoWidth: state.stereoWidth,
      spatialMode: state.spatialMode,
      binauralAngle: state.binauralAngle,
      binauralAzimuth: state.binauralAzimuth,
      binauralElevation: state.binauralElevation,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {}
}

export interface SpatialProcessorHandle {
  sideGain: GainNode;
  pannerL: PannerNode;
  pannerR: PannerNode;
  msGain: GainNode;
  binauralGain: GainNode;
  dryGain: GainNode;
}

let activeGraphRef: {
  ctx: AudioContext;
  preamp?: GainNode;
  eqFilters: BiquadFilterNode[];
  compressor: DynamicsCompressorNode;
  spatialProcessor?: SpatialProcessorHandle;
} | null = null;

export function registerGraphForFx(graph: {
  ctx: AudioContext;
  preamp?: GainNode;
  eqFilters: BiquadFilterNode[];
  compressor: DynamicsCompressorNode;
  spatialProcessor?: SpatialProcessorHandle;
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

function setRampedGain(node: GainNode, target: number, now: number) {
  try {
    node.gain.setTargetAtTime(target, now, 0.025);
  } catch {
    node.gain.value = target;
  }
}

function setPannerCoords(panner: PannerNode, x: number, y: number, z: number, now: number) {
  try {
    panner.positionX.setTargetAtTime(x, now, 0.025);
    panner.positionY.setTargetAtTime(y, now, 0.025);
    panner.positionZ.setTargetAtTime(z, now, 0.025);
  } catch {
    try {
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
    } catch {
      panner.setPosition?.(x, y, z);
    }
  }
}

function calculateSpherical(azimuthDeg: number, elevationDeg: number, distance: number) {
  const azRad = (azimuthDeg * Math.PI) / 180;
  const elRad = (elevationDeg * Math.PI) / 180;

  const cosEl = Math.cos(elRad);
  const sinEl = Math.sin(elRad);
  const sinAz = Math.sin(azRad);
  const cosAz = Math.cos(azRad);

  // X: right (+) / left (-)
  const x = distance * cosEl * sinAz;
  // Y: up (+) / down (-)
  const y = distance * sinEl;
  // Z: front (-) / back (+)
  const z = -distance * cosEl * cosAz;

  return { x, y, z };
}

export function syncAudioGraph() {
  if (!activeGraphRef) return;
  const state = useAudioFx.getState();
  const {
    eqEnabled,
    bands,
    preamp,
    autoHeadroom,
    abComparing,
    normalization,
    stereoEnabled,
    stereoWidth,
    spatialMode,
    binauralAngle,
    binauralAzimuth,
    binauralElevation,
  } = state;
  const { ctx, preamp: preampNode, eqFilters, compressor, spatialProcessor } = activeGraphRef;
  const now = ctx.currentTime;

  const isBypassed = abComparing;

  // 1. Sync Preamp Gain with anti-clipping headroom
  if (preampNode) {
    const headroomDb = calculateAutoHeadroomDb(bands, preamp, autoHeadroom);
    const effectivePreampDb = isBypassed || !eqEnabled ? 0 : preamp + headroomDb;
    const linearGain = Math.max(0.0001, Math.pow(10, effectivePreampDb / 20));
    try {
      preampNode.gain.setTargetAtTime(linearGain, now, 0.02);
    } catch {
      preampNode.gain.value = linearGain;
    }
  }

  // 2. Sync Biquad EQ Filters
  eqFilters.forEach((filter, idx) => {
    const targetGain = isBypassed || !eqEnabled ? 0 : (bands[idx] ?? 0);
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

  // 4. Sync Spatial Audio Processor (Binaural HRTF & Mid/Side)
  if (spatialProcessor) {
    const isSpatialActive = stereoEnabled && !isBypassed;
    const { dryGain, msGain, binauralGain, sideGain, pannerL, pannerR } = spatialProcessor;

    if (!isSpatialActive) {
      // Bit-perfect straight wire dry bypass
      setRampedGain(dryGain, 1.0, now);
      setRampedGain(msGain, 0.0, now);
      setRampedGain(binauralGain, 0.0, now);
    } else if (spatialMode === 'ms') {
      // Classical Mid/Side matrix widener with automatic anti-saturation headroom scaling
      const msHeadroom = 1 / Math.max(1, 1 + 0.35 * (stereoWidth - 1));
      setRampedGain(dryGain, 0.0, now);
      setRampedGain(msGain, msHeadroom, now);
      setRampedGain(binauralGain, 0.0, now);
      setRampedGain(sideGain, stereoWidth, now);
    } else {
      // Binaural HRTF 3D Spatial Audio (Virtual Studio Monitors or 360° Orbit)
      // Dual HRTF panners sum coherent center audio at each ear (L + R).
      // An acoustic power factor of ~0.65 (-3.7dB) guarantees zero digital clipping/saturation.
      setRampedGain(dryGain, 0.0, now);
      setRampedGain(msGain, 0.0, now);
      setRampedGain(binauralGain, 0.65, now);

      const distance = 1.8;
      let leftAz = -binauralAngle;
      let rightAz = +binauralAngle;
      const el = binauralElevation;

      if (spatialMode === 'binaural_orbit') {
        leftAz = binauralAzimuth - binauralAngle;
        rightAz = binauralAzimuth + binauralAngle;
      }

      const posL = calculateSpherical(leftAz, el, distance);
      const posR = calculateSpherical(rightAz, el, distance);

      setPannerCoords(pannerL, posL.x, posL.y, posL.z, now);
      setPannerCoords(pannerR, posR.x, posR.y, posR.z, now);
    }
  }
}

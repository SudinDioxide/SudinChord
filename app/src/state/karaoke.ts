import { create } from 'zustand';

const STORAGE_KEY = 'sudinchord:karaoke:v1';

export interface KaraokeState {
  enabled: boolean;
  /** Vocal reduction level from 0.0 (off) to 1.0 (maximum elimination). Default 0.85. */
  vocalSuppression: number;
  /** Keep low-end kick and sub-bass intact while removing vocals. Default true. */
  preserveBass: boolean;

  setEnabled: (enabled: boolean) => void;
  setVocalSuppression: (val: number) => void;
  setPreserveBass: (preserve: boolean) => void;
  toggle: () => void;
}

function loadSavedKaraoke(): { enabled: boolean; vocalSuppression: number; preserveBass: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : false,
        vocalSuppression: typeof parsed.vocalSuppression === 'number' ? Math.max(0, Math.min(1, parsed.vocalSuppression)) : 0.85,
        preserveBass: typeof parsed.preserveBass === 'boolean' ? parsed.preserveBass : true,
      };
    }
  } catch {}
  return {
    enabled: false,
    vocalSuppression: 0.85,
    preserveBass: true,
  };
}

const saved = loadSavedKaraoke();

export const useKaraoke = create<KaraokeState>((set, get) => ({
  enabled: saved.enabled,
  vocalSuppression: saved.vocalSuppression,
  preserveBass: saved.preserveBass,

  setEnabled(enabled) {
    set({ enabled });
    persist(get());
    syncKaraokeNode();
  },

  setVocalSuppression(vocalSuppression) {
    const clamped = Math.max(0, Math.min(1, Math.round(vocalSuppression * 100) / 100));
    set({ vocalSuppression: clamped });
    persist(get());
    syncKaraokeNode();
  },

  setPreserveBass(preserveBass) {
    set({ preserveBass });
    persist(get());
    syncKaraokeNode();
  },

  toggle() {
    get().setEnabled(!get().enabled);
  },
}));

function persist(state: KaraokeState) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        enabled: state.enabled,
        vocalSuppression: state.vocalSuppression,
        preserveBass: state.preserveBass,
      }),
    );
  } catch {}
}

let activeVocalRemover: { sync: (enabled: boolean, suppression: number, preserveBass: boolean) => void } | null = null;

export function registerVocalRemover(remover: { sync: (enabled: boolean, suppression: number, preserveBass: boolean) => void }) {
  activeVocalRemover = remover;
  syncKaraokeNode();
}

export function syncKaraokeNode() {
  if (!activeVocalRemover) return;
  const { enabled, vocalSuppression, preserveBass } = useKaraoke.getState();
  activeVocalRemover.sync(enabled, vocalSuppression, preserveBass);
}

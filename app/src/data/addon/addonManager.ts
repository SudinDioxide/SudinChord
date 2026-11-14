export interface AddonManifest {
  id: string;
  name: string;
  version?: string;
  description?: string;
  icon?: string;
  resources?: string[];
  types?: string[];
  catalogs?: Array<{ id: string; name: string; type: string }>;
}

export interface AddonTrack {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  durationMs?: number;
  format?: string;
  audioQuality?: string;
  artworkURL?: string;
  streamURL?: string;
  bitrate?: number;
}

export interface AddonStreamResult {
  url?: string;
  codec?: string;
  format?: string;
  audioQuality?: string;
  bitrate?: number;
  kbps?: number;
  sampleRate?: number;
  error?: string;
}

export interface CommunityAddonPreset {
  id: string;
  name: string;
  url: string;
  description: string;
  badge?: string;
  author?: string;
}

export const COMMUNITY_ADDONS: CommunityAddonPreset[] = [
  {
    id: 'org.pencarimovie.music',
    name: 'PencariMusic',
    url: 'https://stream.pencarimovie.com/66ff097863dedb7ccd8401d5ffe616f3/music',
    description: 'Universal music addon - stream Telegram music & audio files via PencariMovie Server',
    badge: 'Universal Lossless',
  },
  {
    id: 'bsm-palv',
    name: 'prodpwh addon',
    url: 'https://addon.palv.org',
    description: 'High-fidelity BitChord streaming gateway (Dolby Atmos & 24-bit/192kHz Hi-Res FLAC)',
    badge: 'Dolby Atmos / Hi-Res',
    author: 'BitChord Addon',
  },
  {
    id: 'app.bitchord.confih',
    name: 'Confih Hi-Res',
    url: 'https://bitchord.confih.tech',
    description: 'Multi-source lossless audio & Dolby Atmos streaming (24-bit/192kHz FLAC)',
    badge: 'Hi-Res 192kHz',
  },
  {
    id: 'dev.bitperfect.qobuz.de.personal',
    name: 'Qobuz [Heisenberg]',
    url: 'https://heisenbergbackaaahh.de.deplexo.com/a/manifest.json',
    description: 'Bit-perfect Qobuz Hi-Res lossless streaming provider',
    badge: 'Qobuz Hi-Res',
  },
  {
    id: 'dev.akira.bitchord-hires',
    name: 'juanjob hi res',
    url: 'https://bitchord-hires-addon.de.deplexo.com/',
    description: 'Multi-source lossless addon: Qobuz hi-res, Tidal, Monochrome, Netease, Deezer, Internet Archive',
    badge: 'Multi-Source Lossless',
  },
];

export interface InstalledAddon {
  id: string;
  url: string;
  name: string;
  version?: string;
  description?: string;
  icon?: string;
  enabled: boolean;
  status: 'connected' | 'error' | 'validating';
  errorMessage?: string | null;
  createdAt: number;
  latencyMs?: number | null;
  lastChecked?: number | null;
}

export interface MultiAddonState {
  addons: InstalledAddon[];
  losslessEnabled: boolean;
}

const STORAGE_ADDONS_KEY = 'sudinchord_addons_list';
const STORAGE_ENABLED_KEY = 'sudinchord_addon_enabled';
const LEGACY_STORAGE_URL_KEY = 'sudinchord_addon_url';

class AddonStore {
  private state: MultiAddonState = {
    addons: [],
    losslessEnabled: true,
  };

  private listeners = new Set<(state: MultiAddonState) => void>();

  constructor() {
    this.init();
  }

  private init() {
    try {
      const storedEnabled = localStorage.getItem(STORAGE_ENABLED_KEY);
      this.state.losslessEnabled = storedEnabled !== null ? storedEnabled === 'true' : true;

      const rawAddons = localStorage.getItem(STORAGE_ADDONS_KEY);
      if (rawAddons) {
        const parsed = JSON.parse(rawAddons) as InstalledAddon[];
        if (Array.isArray(parsed)) {
          // Ensure all community presets exist and are enabled by default
          const existingIds = new Set(parsed.map((a) => a.id));
          const merged = parsed.map((a) => ({ ...a, enabled: true }));
          for (const preset of COMMUNITY_ADDONS) {
            if (!existingIds.has(preset.id)) {
              merged.push({
                id: preset.id,
                url: preset.url.trim().replace(/\/manifest\.json$/, '').replace(/\/+$/, ''),
                name: preset.name,
                description: preset.description,
                enabled: true,
                status: 'connected',
                errorMessage: null,
                createdAt: Date.now(),
              });
            }
          }
          this.state.addons = merged;
        }
      } else {
        // Pre-populate with all BitChord community addons enabled by default
        const legacyUrl = localStorage.getItem(LEGACY_STORAGE_URL_KEY);
        if (legacyUrl) {
          void this.addAddon(legacyUrl);
        } else {
          this.state.addons = COMMUNITY_ADDONS.map((preset, index) => ({
            id: preset.id,
            url: preset.url.trim().replace(/\/manifest\.json$/, '').replace(/\/+$/, ''),
            name: preset.name,
            description: preset.description,
            enabled: true,
            status: 'connected',
            errorMessage: null,
            createdAt: Date.now() + index,
          }));
        }
      }

      // Re-verify manifest and benchmark response times in background
      void this.benchmarkAddons();
    } catch {
      // Ignore storage errors
    }
  }

  getState(): MultiAddonState {
    return this.state;
  }

  subscribe(listener: (state: MultiAddonState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.state);
    }
    this.persist();
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_ADDONS_KEY, JSON.stringify(this.state.addons));
      localStorage.setItem(STORAGE_ENABLED_KEY, String(this.state.losslessEnabled));
    } catch {}
  }

  setLosslessEnabled(enabled: boolean) {
    this.state = { ...this.state, losslessEnabled: enabled };
    this.notify();
  }

  async addAddon(rawUrl: string): Promise<{ ok: boolean; error?: string }> {
    const cleanUrl = rawUrl.trim().replace(/\/manifest\.json$/, '').replace(/\/+$/, '');
    if (!cleanUrl) {
      return { ok: false, error: 'Addon URL cannot be empty' };
    }

    // Check duplicate URL
    if (this.state.addons.some((a) => a.url.toLowerCase() === cleanUrl.toLowerCase())) {
      return { ok: false, error: 'This addon is already added' };
    }

    try {
      const manifest = await this.fetchManifest(cleanUrl);
      const newAddon: InstalledAddon = {
        id: manifest.id || `addon_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        url: cleanUrl,
        name: manifest.name || 'Custom Music Addon',
        version: manifest.version,
        description: manifest.description,
        icon: manifest.icon,
        enabled: true,
        status: 'connected',
        errorMessage: null,
        createdAt: Date.now(),
      };

      // If id already exists (e.g. from previous uninstall), ensure unique id
      if (this.state.addons.some((a) => a.id === newAddon.id)) {
        newAddon.id = `${newAddon.id}_${Date.now()}`;
      }

      this.state = {
        ...this.state,
        addons: [...this.state.addons, newAddon],
      };
      this.notify();
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, error: msg };
    }
  }

  removeAddon(id: string) {
    this.state = {
      ...this.state,
      addons: this.state.addons.filter((a) => a.id !== id),
    };
    this.notify();
  }

  toggleAddon(id: string, enabled: boolean) {
    this.state = {
      ...this.state,
      addons: this.state.addons.map((a) => (a.id === id ? { ...a, enabled } : a)),
    };
    this.notify();
  }

  moveAddon(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= this.state.addons.length) return;

    const list = [...this.state.addons];
    const [moved] = list.splice(index, 1);
    if (!moved) return;
    list.splice(targetIndex, 0, moved);

    this.state = { ...this.state, addons: list };
    this.notify();
  }

  async benchmarkAddons(): Promise<void> {
    const list = [...this.state.addons];
    const tasks = list.map(async (addon) => {
      if (!addon.enabled) return;
      const start = performance.now();
      try {
        const manifestUrl = `${addon.url}/manifest.json`;
        const res = await fetch(manifestUrl, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'BitChord/1.9.1 (Linux; Android 14; com.music.bitchord)',
          },
          signal: AbortSignal.timeout(4000),
        });
        const elapsed = Math.round(performance.now() - start);
        if (res.ok) {
          const manifest = (await res.json()) as AddonManifest;
          addon.status = 'connected';
          addon.errorMessage = null;
          addon.latencyMs = elapsed;
          addon.lastChecked = Date.now();
          if (manifest.name) addon.name = manifest.name;
        } else {
          addon.status = 'error';
          addon.errorMessage = `HTTP ${res.status}`;
          addon.latencyMs = null;
          addon.lastChecked = Date.now();
        }
      } catch (err) {
        addon.status = 'error';
        addon.errorMessage = err instanceof Error ? err.message : 'Timeout / Offline';
        addon.latencyMs = null;
        addon.lastChecked = Date.now();
      }
    });

    await Promise.allSettled(tasks);
    this.state = { ...this.state, addons: list };
    this.notify();
  }

  async installAllCommunityAddons(): Promise<number> {
    let count = 0;
    for (const preset of COMMUNITY_ADDONS) {
      const cleanUrl = preset.url.trim().replace(/\/manifest\.json$/, '').replace(/\/+$/, '');
      if (!this.state.addons.some((a) => a.url.toLowerCase() === cleanUrl.toLowerCase())) {
        const res = await this.addAddon(preset.url);
        if (res.ok) count++;
      }
    }
    return count;
  }

  private async fetchManifest(baseUrl: string): Promise<AddonManifest> {
    const manifestUrl = `${baseUrl}/manifest.json`;
    const res = await fetch(manifestUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'BitChord/1.9.1 (Linux; Android 14; com.music.bitchord)',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      throw new Error(`Addon server responded with status ${res.status}`);
    }
    const data = (await res.json()) as AddonManifest;
    if (!data || !data.id) {
      throw new Error('Server returned an invalid addon manifest (missing id)');
    }
    return data;
  }

  private async verifyAddon(id: string, url: string) {
    try {
      const manifest = await this.fetchManifest(url);
      this.state = {
        ...this.state,
        addons: this.state.addons.map((a) =>
          a.id === id
            ? {
                ...a,
                name: manifest.name || a.name,
                version: manifest.version ?? a.version,
                description: manifest.description ?? a.description,
                icon: manifest.icon ?? a.icon,
                status: 'connected',
                errorMessage: null,
              }
            : a,
        ),
      };
      this.notify();
    } catch (err) {
      this.state = {
        ...this.state,
        addons: this.state.addons.map((a) =>
          a.id === id
            ? {
                ...a,
                status: 'error',
                errorMessage: err instanceof Error ? err.message : String(err),
              }
            : a,
        ),
      };
      this.notify();
    }
  }
}

export const addonStore = new AddonStore();

import { useState } from 'react';
import { ChevronDown, ChevronUp, Link, Plus, Trash2, Disc3, Radio, Server } from 'lucide-react';
import { useAddons } from '@/data/addon/useAddon';
import { getClashFlacConfig, setClashFlacConfig, type ClashEnginePriority } from '@/playback/addon/clashflacResolver';
import { Toggle } from './IntegrationSettings';
import { settingsUi } from './settingsStyles';

const EXAMPLE_ADDON_URL = 'https://stream.pencarimovie.com/66ff097863dedb7ccd8401d5ffe616f3/music';

export function AddonSettings() {
  const { addons, losslessEnabled, addAddon, removeAddon, toggleAddon, moveAddon, setLosslessEnabled } = useAddons();
  const [clashConfig, setClashState] = useState(getClashFlacConfig);
  const [inputUrl, setInputUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const updateClash = (patch: Partial<ReturnType<typeof getClashFlacConfig>>) => {
    setClashFlacConfig(patch);
    setClashState(getClashFlacConfig());
  };

  const handleAdd = async (urlToAdd?: string) => {
    const target = urlToAdd !== undefined ? urlToAdd : inputUrl;
    if (!target.trim()) return;

    setIsAdding(true);
    setErrorMsg(null);
    const res = await addAddon(target);
    setIsAdding(false);

    if (res.ok) {
      setInputUrl('');
    } else {
      setErrorMsg(res.error || 'Failed to connect to addon');
    }
  };

  const handleUseExample = () => {
    setInputUrl(EXAMPLE_ADDON_URL);
    void handleAdd(EXAMPLE_ADDON_URL);
  };

  return (
    <>
      <h2 className={settingsUi.sectionHeader}>Lossless Audio Addons</h2>
      <section className={settingsUi.group}>
        <Toggle
          label="Play Lossless Audio via Addons"
          detail="Automatically checks your enabled addons in priority order and streams Lossless FLAC whenever available."
          checked={losslessEnabled}
          onChange={setLosslessEnabled}
        />

        {/* ClashFLAC Direct Qobuz & Tidal Provider Card */}
        <div className="flex flex-col gap-3 p-4 border-t border-white/5 bg-quaternary/15">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
                <Disc3 size={18} />
              </div>
              <div className="flex flex-col">
                <span className="type-body-emphasized text-primary flex items-center gap-2">
                  ClashFLAC Lossless Engine
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300">
                    Qobuz • Tidal • JioSaavn
                  </span>
                </span>
                <span className="type-callout text-secondary">
                  Direct Hi-Res FLAC (up to 24-bit/192kHz) and Hi-Fi master audio streams.
                </span>
              </div>
            </div>
            <Toggle
              label=""
              detail=""
              checked={clashConfig.enabled}
              onChange={(val) => updateClash({ enabled: val })}
            />
          </div>

          {clashConfig.enabled && (
            <div className="flex flex-col gap-3 pt-2 border-t border-white/5">
              {/* Engine Priority */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="type-callout text-secondary flex items-center gap-1.5">
                  <Radio size={14} className="text-key" /> Preferred Stream Engine:
                </span>
                <div className="inline-flex rounded-lg border border-white/10 bg-quaternary/40 p-0.5">
                  {(['qobuz', 'tidal', 'jiosaavn'] as ClashEnginePriority[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => updateClash({ priority: p })}
                      className={`px-3 py-1 rounded-md type-callout capitalize font-medium transition-all ${
                        clashConfig.priority === p
                          ? 'bg-key text-white shadow-sm'
                          : 'text-secondary hover:text-primary'
                      }`}
                    >
                      {p === 'qobuz' ? 'Qobuz Hi-Res' : p === 'tidal' ? 'Tidal HiFi' : 'JioSaavn'}
                    </button>
                  ))}
                </div>
              </div>

              {/* API Base URL */}
              <div className="flex flex-col gap-1.5">
                <span className="type-callout text-secondary flex items-center gap-1.5">
                  <Server size={14} className="text-key" /> ClashFLAC Backend Endpoint:
                </span>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    className="flex-1 rounded-[8px] border border-white/10 bg-quaternary px-3 py-1.5 type-body text-primary placeholder:text-tertiary focus:outline-none focus:border-key text-xs font-mono"
                    placeholder="https://clashflac.kanjijewels.com"
                    value={clashConfig.apiBase}
                    onChange={(e) => updateClash({ apiBase: e.target.value })}
                  />
                  <div className="flex gap-1.5 flex-none">
                    <button
                      className="px-2.5 py-1 rounded-[6px] border border-white/10 bg-quaternary/60 hover:bg-quaternary text-xs text-secondary hover:text-primary"
                      onClick={() => updateClash({ apiBase: 'https://clashflac.kanjijewels.com' })}
                    >
                      Default
                    </button>
                    <button
                      className="px-2.5 py-1 rounded-[6px] border border-white/10 bg-quaternary/60 hover:bg-quaternary text-xs text-secondary hover:text-primary"
                      onClick={() => updateClash({ apiBase: 'http://127.0.0.1:8000' })}
                    >
                      Local (8000)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Add Addon Input Card */}
        <div className="flex flex-col gap-3 p-4 border-t border-white/5 bg-quaternary/10">
          <div className="flex flex-col gap-0.5">
            <span className="type-body-emphasized text-primary">Add New Music Addon</span>
            <span className="type-callout text-secondary">
              Connect any compatible music addon link (Stremio/BitChord music server).
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="flex-1 rounded-[8px] border border-white/10 bg-quaternary px-3 py-2 type-body text-primary placeholder:text-tertiary focus:outline-none focus:border-key"
              placeholder="https://.../music"
              value={inputUrl}
              onChange={(e) => {
                setInputUrl(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              disabled={isAdding}
            />
            <button
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-[8px] bg-key text-white font-medium type-callout disabled:opacity-50 hover:brightness-110 flex-none"
              onClick={() => handleAdd()}
              disabled={isAdding || !inputUrl.trim()}
            >
              {isAdding ? (
                <span>Adding…</span>
              ) : (
                <>
                  <Plus size={15} />
                  <span>Add Addon</span>
                </>
              )}
            </button>
          </div>

          {errorMsg && <p className="type-callout text-red-400">Failed to add: {errorMsg}</p>}

          <div className="flex items-center justify-between pt-1 type-callout text-secondary">
            <span className="truncate mr-2">Try example link: PencariMusic Server</span>
            <button
              className="flex-none text-key hover:underline font-medium"
              onClick={handleUseExample}
              disabled={isAdding}
            >
              Add Example
            </button>
          </div>
        </div>

        {/* Installed Addons List */}
        {addons.length > 0 ? (
          <div className="divide-y divide-white/5 border-t border-white/5">
            {addons.map((addon, index) => (
              <div key={addon.id} className="flex items-center gap-3 p-4 hover:bg-quaternary/20 transition-colors">
                {/* Reorder buttons */}
                <div className="flex flex-col gap-1 flex-none text-secondary">
                  <button
                    className="p-0.5 rounded hover:bg-white/10 hover:text-primary disabled:opacity-30 disabled:pointer-events-none"
                    onClick={() => moveAddon(index, 'up')}
                    disabled={index === 0}
                    title="Move Up (Higher Priority)"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    className="p-0.5 rounded hover:bg-white/10 hover:text-primary disabled:opacity-30 disabled:pointer-events-none"
                    onClick={() => moveAddon(index, 'down')}
                    disabled={index === addons.length - 1}
                    title="Move Down (Lower Priority)"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>

                {/* Addon Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`size-2 rounded-full flex-none ${
                        addon.status === 'connected'
                          ? addon.enabled
                            ? 'bg-emerald-400 animate-pulse'
                            : 'bg-zinc-500'
                          : 'bg-red-400'
                      }`}
                    />
                    <span className="font-semibold text-primary truncate">{addon.name}</span>
                    {addon.version && (
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-white/10 text-secondary flex-none">
                        v{addon.version}
                      </span>
                    )}
                    <span className="text-[11px] text-tertiary flex-none">#{index + 1}</span>
                  </div>

                  {addon.description && (
                    <p className="type-callout text-secondary leading-snug line-clamp-1 mt-0.5">
                      {addon.description}
                    </p>
                  )}

                  <div className="flex items-center gap-1.5 mt-1 text-[11px] text-tertiary truncate">
                    <Link size={11} className="flex-none" />
                    <span className="truncate">{addon.url}</span>
                  </div>

                  {addon.status === 'error' && addon.errorMessage && (
                    <p className="type-callout text-red-400 mt-1">{addon.errorMessage}</p>
                  )}
                </div>

                {/* Actions: Toggle & Remove */}
                <div className="flex items-center gap-3 flex-none pl-2">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className={settingsUi.switch}
                      checked={addon.enabled}
                      onChange={(e) => toggleAddon(addon.id, e.target.checked)}
                      title={addon.enabled ? 'Enabled' : 'Disabled'}
                    />
                  </label>

                  <button
                    className="p-1.5 rounded-[6px] text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    onClick={() => removeAddon(addon.id)}
                    title="Remove Addon"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 border-t border-white/5 text-center type-callout text-secondary">
            No addons installed yet. Add a music addon link above to enable lossless streaming.
          </div>
        )}
      </section>
    </>
  );
}

import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, DownloadCloud, Globe, Link, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useAddons, COMMUNITY_ADDONS, type CommunityAddonPreset } from '@/data/addon/useAddon';
import { Toggle } from './IntegrationSettings';
import { settingsUi } from './settingsStyles';

export function AddonSettings() {
  const {
    addons,
    losslessEnabled,
    addAddon,
    removeAddon,
    toggleAddon,
    moveAddon,
    setLosslessEnabled,
    installAllCommunityAddons,
  } = useAddons();

  const [inputUrl, setInputUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

  const handleAddPreset = async (preset: CommunityAddonPreset) => {
    setAddingId(preset.id);
    setErrorMsg(null);
    await addAddon(preset.url);
    setAddingId(null);
  };

  const handleAddAll = async () => {
    setIsAdding(true);
    setErrorMsg(null);
    await installAllCommunityAddons();
    setIsAdding(false);
  };

  const isPresetInstalled = (presetUrl: string) => {
    const cleanPreset = presetUrl.trim().replace(/\/manifest\.json$/, '').replace(/\/+$/, '').toLowerCase();
    return addons.some((a) => a.url.toLowerCase() === cleanPreset);
  };

  const allPresetsInstalled = COMMUNITY_ADDONS.every((p) => isPresetInstalled(p.url));

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

        {/* Add Addon Input Card */}
        <div className="flex flex-col gap-3 p-4 border-t border-white/5 bg-quaternary/10">
          <div className="flex flex-col gap-0.5">
            <span className="type-body-emphasized text-primary">Add Custom Music Addon</span>
            <span className="type-callout text-secondary">
              Connect any compatible BitChord or Stremio music provider link.
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className="flex-1 rounded-[8px] border border-white/10 bg-quaternary px-3 py-2 type-body text-primary placeholder:text-tertiary focus:outline-none focus:border-key"
              placeholder="https://.../manifest.json"
              value={inputUrl}
              onChange={(e) => {
                setInputUrl(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              disabled={isAdding}
            />
            <button
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-[8px] bg-key text-white font-medium type-callout disabled:opacity-50 hover:brightness-110 flex-none cursor-pointer"
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
        </div>

        {/* Installed Addons List */}
        {addons.length > 0 ? (
          <div className="divide-y divide-white/5 border-t border-white/5">
            <div className="px-4 py-2 bg-white/[0.02] flex items-center justify-between text-xs text-secondary font-semibold">
              <span>Active Addons (Priority Order)</span>
              <span>{addons.filter((a) => a.enabled).length} of {addons.length} enabled</span>
            </div>
            {addons.map((addon, index) => (
              <div key={addon.id} className="flex items-center gap-3 p-4 hover:bg-quaternary/20 transition-colors">
                {/* Reorder buttons */}
                <div className="flex flex-col gap-1 flex-none text-secondary">
                  <button
                    className="p-0.5 rounded hover:bg-white/10 hover:text-primary disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                    onClick={() => moveAddon(index, 'up')}
                    disabled={index === 0}
                    title="Move Up (Higher Priority)"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    className="p-0.5 rounded hover:bg-white/10 hover:text-primary disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
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
                    <span className="text-[11px] text-tertiary flex-none font-mono">#{index + 1}</span>
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
                    className="p-1.5 rounded-[6px] text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
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
            No addons installed yet. Add a music addon link or select from the community addons below.
          </div>
        )}
      </section>

      {/* Recommended Community Addons Shelf */}
      <h2 className={settingsUi.sectionHeader}>BitChord Community Addons</h2>
      <section className={settingsUi.group}>
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div>
            <h3 className="type-body-emphasized text-primary flex items-center gap-2">
              <Sparkles size={16} className="text-amber-400" />
              <span>Verified Streaming Sources</span>
            </h3>
            <p className="type-callout text-secondary mt-0.5">
              High-resolution lossless FLAC and Dolby Atmos music sources for BitChord.
            </p>
          </div>

          {!allPresetsInstalled && (
            <button
              onClick={handleAddAll}
              disabled={isAdding}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[8px] bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.1] text-xs font-semibold text-white transition-all cursor-pointer disabled:opacity-50"
            >
              <DownloadCloud size={14} />
              <span>Install All</span>
            </button>
          )}
        </div>

        <div className="divide-y divide-white/5">
          {COMMUNITY_ADDONS.map((preset) => {
            const installed = isPresetInstalled(preset.url);
            const isThisAdding = addingId === preset.id;

            return (
              <div
                key={preset.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-primary">{preset.name}</span>
                    {preset.badge && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-[4px] bg-amber-400/15 border border-amber-400/30 text-amber-300">
                        {preset.badge}
                      </span>
                    )}
                  </div>
                  <p className="type-callout text-secondary mt-1">{preset.description}</p>
                  <div className="flex items-center gap-1 mt-1 text-[11px] text-tertiary font-mono truncate">
                    <Globe size={11} className="shrink-0" />
                    <span className="truncate">{preset.url}</span>
                  </div>
                </div>

                <div className="shrink-0 self-start sm:self-center">
                  {installed ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-emerald-500/10 border border-emerald-500/25 text-xs font-semibold text-emerald-400 select-none">
                      <Check size={14} />
                      <span>Added</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAddPreset(preset)}
                      disabled={isThisAdding || isAdding}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-[8px] bg-key hover:brightness-110 text-xs font-bold text-white shadow-sm shadow-key/20 transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Plus size={14} />
                      <span>{isThisAdding ? 'Adding…' : 'Add Addon'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}

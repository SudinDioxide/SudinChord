import { useEffect, useState } from 'react';
import { addonStore, COMMUNITY_ADDONS, type MultiAddonState, type InstalledAddon, type CommunityAddonPreset } from './addonManager';

export { COMMUNITY_ADDONS, type CommunityAddonPreset };

export function useAddons(): MultiAddonState & {
  addAddon: (url: string) => Promise<{ ok: boolean; error?: string }>;
  removeAddon: (id: string) => void;
  toggleAddon: (id: string, enabled: boolean) => void;
  moveAddon: (index: number, direction: 'up' | 'down') => void;
  setLosslessEnabled: (enabled: boolean) => void;
  installAllCommunityAddons: () => Promise<number>;
} {
  const [state, setState] = useState<MultiAddonState>(addonStore.getState());

  useEffect(() => {
    return addonStore.subscribe(setState);
  }, []);

  return {
    ...state,
    addAddon: (url: string) => addonStore.addAddon(url),
    removeAddon: (id: string) => addonStore.removeAddon(id),
    toggleAddon: (id: string, enabled: boolean) => addonStore.toggleAddon(id, enabled),
    moveAddon: (index: number, direction: 'up' | 'down') => addonStore.moveAddon(index, direction),
    setLosslessEnabled: (enabled: boolean) => addonStore.setLosslessEnabled(enabled),
    installAllCommunityAddons: () => addonStore.installAllCommunityAddons(),
  };
}

// Backwards compatibility export
export const useAddon = useAddons;

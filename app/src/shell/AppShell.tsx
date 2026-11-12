import { lazy, Suspense, useEffect, useState } from 'react';
import { resumeSession } from '@/party/listenTogether';
import { startPartySync } from '@/party/partySync';
import { useDiscordPresence } from '@/playback/discordPresence';
import { useMediaSession } from '@/playback/mediaSession';
import { startHistoryReporting } from '@/playback/historyReporting';
import { startLivePresence } from '@/playback/livePresence';
import { Outlet, useNavigate } from 'react-router';
import { PrefetchLink } from '@/components/PrefetchLink';
import { config } from '@/config';
import { useExtension } from '@/extension/useExtension';
import { isMobileBrowser } from '@/lib/platform';
import { useUi } from '@/state/ui';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';
import { Banner, bannerButtonClass } from './Banner';
import { MobileTopBar } from './MobileTopBar';
import { PlayerBar } from './PlayerBar';
import { SidePanel } from './SidePanel';
import { Sidebar } from './Sidebar';
import { AmbientAppBackdrop } from './AmbientAppBackdrop';
import { NewPlaylistModal } from '@/components/music/NewPlaylistModal';
import { EqualizerModal } from '@/components/audio/EqualizerModal';
import { Music2 } from 'lucide-react';
import { localTracksManager } from '@/playback/local/localTracks';
import { playList } from '@/components/music/play';

const mobile = isMobileBrowser();

// It carries am-lyrics; loaded the first time it opens, as the side panel's lyrics are.
const FullScreenPlayer = lazy(() => import('./FullScreenPlayer').then((m) => ({ default: m.FullScreenPlayer })));

/**
 * The app frame (report §1): glass sidebar, the scrolling page, the floating
 * player pill, the side panel, and the bottom band when there is one.
 */
export function AppShell() {
  useKeyboardShortcuts();
  useDiscordPresence();
  useMediaSession();
  // Listen Together: pick a party back up after a reload, and keep the player in step with it.
  useEffect(() => {
    resumeSession();
    return startPartySync();
  }, []);
  // Automatically restore the last opened music folder on launch
  useEffect(() => {
    void localTracksManager.init();
  }, []);
  // Plays into the account's YouTube Music history (Settings › Share Listening Activity).
  useEffect(() => startHistoryReporting(), []);
  // Counts this tab in the "listening now" figure beside the phone and PC apps.
  useEffect(() => startLivePresence(), []);
  const extension = useExtension();
  const bannerDismissed = useUi((s) => s.installBannerDismissed);
  const dismissBanner = useUi((s) => s.dismissInstallBanner);
  const fullScreen = useUi((s) => s.fullScreen);
  const navigate = useNavigate();
  const [dragging, setDragging] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{ version: string } | null>(null);

  useEffect(() => {
    const ep = (window as unknown as {
      electronPlatform?: {
        onUpdateDownloaded?: (cb: (info: { version: string }) => void) => () => void;
        installUpdate?: () => void;
      };
    }).electronPlatform;

    if (ep?.onUpdateDownloaded) {
      return ep.onUpdateDownloaded((info) => {
        setUpdateInfo(info);
      });
    }
  }, []);

  useEffect(() => {
    let counter = 0;
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      counter++;
      if (e.dataTransfer?.types?.includes('Files')) {
        setDragging(true);
      }
    };
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      counter--;
      if (counter <= 0) {
        counter = 0;
        setDragging(false);
      }
    };
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
    };
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      counter = 0;
      setDragging(false);
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length) {
        const tracks = await localTracksManager.addFiles(files);
        if (tracks.length) {
          playList(tracks, 0, { source: { title: 'Local Files', type: 'playlist', id: 'local-files' } });
          navigate('/local');
        }
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [navigate]);

  let banner = null;
  if (extension.state === 'missing' && !bannerDismissed) {
    banner = (
      <Banner
        title="Play YouTube Music with the SudinChord extension."
        detail="Playback, YouTube Music sign-in, Spotify and Discord need the extension. Addons and lyrics work without it."
        action={
          <PrefetchLink className={bannerButtonClass} to="/extension">
            Get the Extension
          </PrefetchLink>
        }
        onDismiss={dismissBanner}
      />
    );
  }

  return (
    <div className="grid h-full grid-rows-[minmax(0,1fr)_auto]">
      {/* The side panel slides in from beyond the right edge; never let it scroll the page. */}
      <div className="relative min-h-0 overflow-hidden">
        <AmbientAppBackdrop />
        <Sidebar />
        <MobileTopBar />
        {/* The page scrolls under the fixed sidebar and the floating player. */}
        <main
          id="scrollable-page"
          className="absolute inset-0 overflow-x-hidden overflow-y-auto pl-(--web-navigation-width) [scrollbar-gutter:stable] data-tint:bg-(--page-tint) data-tint:transition-[background-color] data-tint:duration-300 data-tint:ease-in max-sm:pt-(--mobile-top-bar-height) max-sm:pl-0"
        >
          {/* Clears the floating pill: its height, its offset, and some air. */}
          <div className="min-h-full pb-[calc(var(--player-pill-height)+var(--player-bottom-offset)+40px)]">
            <Outlet />
          </div>
        </main>
        <PlayerBar />
        <SidePanel />
        <NewPlaylistModal />
      </div>
      {updateInfo ? (
        <Banner
          title={`SudinChord v${updateInfo.version} is ready!`}
          detail="A new update has been downloaded in the background. Restart now to apply."
          action={
            <button
              type="button"
              className={bannerButtonClass}
              onClick={() => {
                const ep = (window as unknown as { electronPlatform?: { installUpdate?: () => void } }).electronPlatform;
                ep?.installUpdate?.();
              }}
            >
              Restart & Update
            </button>
          }
          onDismiss={() => setUpdateInfo(null)}
        />
      ) : (
        banner
      )}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center bg-black/75 backdrop-blur-md">
          <div className="grid size-20 place-items-center rounded-full bg-key/20 text-key shadow-[0_0_40px_rgba(255,0,51,0.3)] animate-pulse">
            <Music2 size={40} />
          </div>
          <p className="mt-4 type-title-2-emphasized text-white">Drop audio files to play in SudinChord</p>
          <p className="mt-1 type-callout text-white/70">Supports MP3, FLAC, WAV, M4A, AAC, OGG</p>
        </div>
      )}
      {fullScreen && (
        <Suspense fallback={null}>
          <FullScreenPlayer />
        </Suspense>
      )}
      <EqualizerModal />
    </div>
  );
}

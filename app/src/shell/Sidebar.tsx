import { ListMusic, Plus, Settings, Trash2 } from 'lucide-react';
import { NavHistoryButtons } from '@/components/NavHistoryButtons';
import { useLocation, useNavigate } from 'react-router';
import { MdOutlineExtension } from 'react-icons/md';
import { PrefetchLink, PrefetchNavLink } from '@/components/PrefetchLink';
import { LogoMark } from '@/components/icons/LogoMark';
import {
  AlbumsIcon,
  AllPlaylistsIcon,
  ArtistsIcon,
  HomeIcon,
  LocalFilesIcon,
  MadeForYouIcon,
  NewIcon,
  RecentlyAddedIcon,
  SearchIcon,
  SongsIcon,
  type NavIconProps,
} from '@/components/icons/NavIcons';
import { hrefFor } from '@/components/music/links';
import { config } from '@/config';
import { LIBRARY_SECTIONS, type LibrarySection } from '@/data/music/library';
import { useDeleteYouTubePlaylist, useLibraryPlaylists, useSignedIn } from '@/data/music/queries';
import { useSpotifyPlaylists } from '@/data/spotify/queries';
import { useExtensionUpdate } from '@/extension/useExtensionUpdate';
import { useSpotifySignedIn } from '@/extension/useSpotifyAuth';
import { localPlaylists, useLocalPlaylists } from '@/playback/local/localPlaylists';
import { useNewPlaylistModal } from '@/state/newPlaylistModal';
import { useUi } from '@/state/ui';
import { AccountButton } from './AccountButton';

interface NavItem {
  to: string;
  label: string;
  Icon: (props: NavIconProps) => React.ReactNode;
}

const PRIMARY: NavItem[] = [
  { to: '/search', label: 'Search', Icon: SearchIcon },
  { to: '/home', label: 'Home', Icon: HomeIcon },
  { to: '/new', label: 'New', Icon: NewIcon },
  { to: '/local', label: 'Local Files', Icon: LocalFilesIcon },
];

const LIBRARY_ICONS: Record<Exclude<LibrarySection, 'playlists'>, NavItem['Icon']> = {
  recent: RecentlyAddedIcon,
  artists: ArtistsIcon,
  albums: AlbumsIcon,
  songs: SongsIcon,
  'made-for-you': MadeForYouIcon,
};

const LIBRARY: NavItem[] = (Object.keys(LIBRARY_ICONS) as (keyof typeof LIBRARY_ICONS)[]).map((section) => ({
  to: `/library/${section}`,
  label: LIBRARY_SECTIONS[section].title,
  Icon: LIBRARY_ICONS[section],
}));

// A sidebar row; NavLink sets aria-current on the page's own row.
const item =
  'group flex h-9 items-center gap-2 mb-0.5 p-1 rounded-nav type-body-reduced text-primary hover:bg-quinary aria-[current=page]:bg-nav-selected';
// Apple's glyphs, drawn at 24px (their 24-unit box), which the user preferred to Apple's own 28px.
const icon = 'inline-grid size-6 flex-none place-items-center text-primary group-aria-[current=page]:text-key';
const navLabel = 'min-w-0 truncate';
// "Library", "Playlists" (report §1: 12px/15px 600, secondary, padding 4px 8px).
const sectionHeader = 'mt-4 px-2 py-1 type-callout-emphasized text-secondary';
const list = 'flex flex-col';

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate: () => void }) {
  return (
    <ul className={list}>
      {items.map(({ to, label, Icon }) => (
        <li key={to}>
          <PrefetchNavLink to={to} className={item} onClick={onNavigate}>
            <Icon size={24} className={icon} />
            <span className={navLabel}>{label}</span>
          </PrefetchNavLink>
        </li>
      ))}
    </ul>
  );
}

function LocalPlaylistNav({ onNavigate }: { onNavigate: () => void }) {
  const playlists = useLocalPlaylists();
  const openNew = useNewPlaylistModal((s) => s.open);
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <>
      <div className="flex items-center justify-between pr-3 pt-3">
        <h2 className={sectionHeader}>Local Playlists</h2>
        <button
          type="button"
          className="p-1 rounded-md text-secondary hover:text-primary hover:bg-white/10 transition-colors cursor-pointer"
          title="Create New Playlist"
          onClick={() => openNew({ defaultPlatform: 'local' })}
        >
          <Plus size={15} />
        </button>
      </div>
      <ul className={list}>
        {playlists.map((playlist) => (
          <li key={playlist.id} className="group/item relative flex items-center">
            <PrefetchNavLink to={`/playlist/${encodeURIComponent(playlist.id)}`} className={`${item} flex-1 pr-8`} onClick={onNavigate}>
              <span className={icon}>
                <ListMusic size={17} strokeWidth={1.8} />
              </span>
              <span className={navLabel}>{playlist.name}</span>
            </PrefetchNavLink>
            <button
              type="button"
              className="absolute right-1 opacity-0 group-hover/item:opacity-100 p-1.5 rounded-md text-secondary hover:text-red-400 hover:bg-white/10 transition-all cursor-pointer"
              title={`Delete "${playlist.name}"`}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (window.confirm(`Delete playlist "${playlist.name}"?`)) {
                  localPlaylists.delete(playlist.id);
                  if (location.pathname.includes(encodeURIComponent(playlist.id))) {
                    navigate('/home');
                  }
                }
              }}
            >
              <Trash2 size={13} />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Library and Playlists (report §1), once YouTube requests are made as the user. */
function LibraryNav({ onNavigate }: { onNavigate: () => void }) {
  const playlists = useLibraryPlaylists();
  const openNew = useNewPlaylistModal((s) => s.open);
  const deleteMutation = useDeleteYouTubePlaylist();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <>
      <h2 className={sectionHeader}>Library</h2>
      <NavList items={LIBRARY} onNavigate={onNavigate} />
      <div className="flex items-center justify-between pr-3 pt-3">
        <h2 className={sectionHeader}>YouTube Playlists</h2>
        <button
          type="button"
          className="p-1 rounded-md text-secondary hover:text-primary hover:bg-white/10 transition-colors cursor-pointer"
          title="Create YouTube Playlist"
          onClick={() => openNew({ defaultPlatform: 'youtube' })}
        >
          <Plus size={15} />
        </button>
      </div>
      <ul className={list}>
        <li>
          <PrefetchNavLink to="/library/playlists" className={item} onClick={onNavigate}>
            <AllPlaylistsIcon size={24} className={icon} />
            <span className={navLabel}>{LIBRARY_SECTIONS.playlists.title}</span>
          </PrefetchNavLink>
        </li>
        {playlists.data?.map((playlist) => {
          const href = hrefFor(playlist) ?? '/library/playlists';
          return (
            <li key={playlist.id} className="group/item relative flex items-center">
              <PrefetchNavLink to={href} className={`${item} flex-1 pr-8`} onClick={onNavigate}>
                <span className={icon}>
                  <ListMusic size={17} strokeWidth={1.8} />
                </span>
                <span className={navLabel}>{playlist.title}</span>
              </PrefetchNavLink>
              <button
                type="button"
                className="absolute right-1 opacity-0 group-hover/item:opacity-100 p-1.5 rounded-md text-secondary hover:text-red-400 hover:bg-white/10 transition-all cursor-pointer"
                title={`Delete "${playlist.title}"`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (window.confirm(`Delete playlist "${playlist.title}" from YouTube?`)) {
                    deleteMutation.mutate(playlist.id, {
                      onSuccess: () => {
                        if (location.pathname.includes(encodeURIComponent(playlist.id))) {
                          navigate('/library/playlists');
                        }
                      },
                    });
                  }
                }}
              >
                <Trash2 size={13} />
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Spotify's playlists, once the extension can read them as the user (prompt §7.1). */
function SpotifyNav({ onNavigate }: { onNavigate: () => void }) {
  const playlists = useSpotifyPlaylists();
  return (
    <>
      <h2 className={sectionHeader}>Spotify</h2>
      <ul className={list}>
        <li>
          <PrefetchNavLink to="/spotify" end className={item} onClick={onNavigate}>
            <AllPlaylistsIcon size={24} className={icon} />
            <span className={navLabel}>All Spotify Playlists</span>
          </PrefetchNavLink>
        </li>
        {playlists.data?.map((playlist) => (
          <li key={playlist.id}>
            <PrefetchNavLink to={`/spotify/playlist/${encodeURIComponent(playlist.id)}`} className={item} onClick={onNavigate}>
              <span className={icon}>
                <ListMusic size={17} strokeWidth={1.8} />
              </span>
              <span className={navLabel}>{playlist.name}</span>
            </PrefetchNavLink>
          </li>
        ))}
      </ul>
    </>
  );
}

/** The left glass sidebar (report §1). */
export function Sidebar() {
  const drawerOpen = useUi((s) => s.drawerOpen);
  const setDrawerOpen = useUi((s) => s.setDrawerOpen);
  const update = useExtensionUpdate();
  const signedIn = useSignedIn();
  const spotifySignedIn = useSpotifySignedIn();
  const close = () => setDrawerOpen(false);

  return (
    <>
      {/* Below 484px the sidebar is a drawer opened from the top bar's menu button. */}
      <nav
        className="absolute inset-y-0 left-0 z-(--z-web-chrome) flex w-(--web-navigation-width) flex-col glass-material max-sm:w-[min(300px,82vw)] max-sm:-translate-x-full max-sm:shadow-glass max-sm:transition-transform max-sm:duration-(--duration-panel) max-sm:ease-panel max-sm:data-[open=true]:translate-none"
        data-open={drawerOpen}
        aria-label="Main"
      >
        <div className="mt-2 ml-2 flex h-18 items-center justify-between pr-4 pl-5">
          <PrefetchLink
            to="/home"
            className="inline-flex items-center gap-2 rounded-[6px]"
            aria-label="SudinChord, Home"
            onClick={close}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {/* White on dark, as Apple's own wordmark; it follows the label colour so it stays visible in light. */}
            <LogoMark size={22} className="text-primary" />
            <span className="type-[700_19px/24px] tracking-[-0.01em]">SudinChord</span>
          </PrefetchLink>
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <NavHistoryButtons />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-3 pl-5 [scrollbar-width:none]">
          <NavList items={PRIMARY} onNavigate={close} />
          <LocalPlaylistNav onNavigate={close} />
          {signedIn && <LibraryNav onNavigate={close} />}
          {spotifySignedIn && <SpotifyNav onNavigate={close} />}
        </div>
        <div className="flex flex-col gap-2 pt-3 pr-3 pb-5 pl-5">
          <PrefetchNavLink to="/extension" className={item} onClick={close}>
            {/* Chrome's own toolbar glyph for extensions (Material "extension"). */}
            <span className={icon}>
              <MdOutlineExtension size={18} />
            </span>
            <span className={navLabel}>SudinChord Extension</span>
            {update.state === 'available' && (
              <span className="ml-auto rounded-[10px] bg-key px-[7px] py-0.5 type-subhead-emphasized text-white" title={`Version ${update.latest.version} is available`}>
                Update
              </span>
            )}
          </PrefetchNavLink>
          <AccountButton />
          <div className="flex items-center justify-between pt-1">
            <PrefetchNavLink to="/settings" className="inline-flex items-center gap-2 ps-1 type-callout text-secondary hover:text-primary" aria-label="Settings" title="Settings" onClick={close}>
              <Settings size={16} strokeWidth={1.9} />
              <span>Settings</span>
            </PrefetchNavLink>
          </div>
        </div>
      </nav>
      {drawerOpen && <div className="absolute inset-0 z-[calc(var(--z-web-chrome)-1)] hidden bg-scrim max-sm:block" onClick={close} aria-hidden="true" />}
    </>
  );
}

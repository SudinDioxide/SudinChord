import { ChevronLeft, ChevronRight, FolderPlus, ListEnd, ListPlus, ListStart, MoreHorizontal, Plus, Star, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { SiYoutube } from 'react-icons/si';
import { Menu, MenuHeader, MenuItem, MenuSeparator, type MenuPlacement } from '@/components/Menu';
import {
  useAddToPlaylist,
  useLikeStatus,
  usePlaylistOptions,
  useSetLiked,
  useSignedIn,
} from '@/data/music/queries';
import { useLocalPlaylists, localPlaylists } from '@/playback/local/localPlaylists';
import { useNewPlaylistModal } from '@/state/newPlaylistModal';
import type { Track } from '@/data/music/types';
import { usePlayer } from '@/state/player';

function PlaylistChoices({ track, onDone, onBack }: { track: Track; onDone: () => void; onBack: () => void }) {
  const options = usePlaylistOptions(track.videoId, true);
  const addYouTube = useAddToPlaylist();
  const localLists = useLocalPlaylists();
  const signedIn = useSignedIn();
  const openNew = useNewPlaylistModal((s) => s.open);

  return (
    <>
      <MenuItem icon={<ChevronLeft size={14} />} onSelect={onBack}>
        Back
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        icon={<Plus size={14} className="text-emerald-400" />}
        onSelect={() => {
          onDone();
          openNew({ initialTrack: track });
        }}
      >
        New Playlist...
      </MenuItem>

      {/* Local Playlists */}
      {localLists.length > 0 && (
        <>
          <MenuSeparator />
          <MenuHeader>Local Playlists</MenuHeader>
          {localLists.map((p) => (
            <MenuItem
              key={p.id}
              icon={<FolderPlus size={14} className="text-emerald-400" />}
              onSelect={() => {
                localPlaylists.addTracks(p.id, [track]);
                onDone();
              }}
            >
              {p.name}
            </MenuItem>
          ))}
        </>
      )}

      {/* YouTube Playlists */}
      {signedIn && options.data && options.data.length > 0 && (
        <>
          <MenuSeparator />
          <MenuHeader>YouTube Playlists</MenuHeader>
          {options.data.map((option) => (
            <MenuItem
              key={option.playlistId}
              icon={<SiYoutube size={14} className="text-red-500" />}
              onSelect={() => {
                addYouTube.mutate({ playlistId: option.playlistId, videoId: track.videoId });
                onDone();
              }}
            >
              {option.title}
            </MenuItem>
          ))}
        </>
      )}
    </>
  );
}

function AccountFavorite({ track, onClose }: { track: Track; onClose: () => void }) {
  const status = useLikeStatus(track.videoId);
  const setLiked = useSetLiked();
  const liked = status.data === 'LIKE';
  return (
    <MenuItem
      icon={<Star size={15} fill={liked ? 'currentColor' : 'none'} />}
      disabled={status.isPending}
      onSelect={() => {
        setLiked.mutate({ videoId: track.videoId, liked: !liked });
        onClose();
      }}
    >
      {liked ? 'Unfavorite' : 'Favorite'}
    </MenuItem>
  );
}

function TrackMenuItems({
  track,
  onClose,
  onRemoveFromPlaylist,
}: {
  track: Track;
  onClose: () => void;
  onRemoveFromPlaylist?: () => void;
}) {
  const [view, setView] = useState<'main' | 'playlists'>('main');
  const signedIn = useSignedIn();
  if (view === 'playlists') {
    return <PlaylistChoices track={track} onDone={onClose} onBack={() => setView('main')} />;
  }
  const { playNext, addToQueue } = usePlayer.getState();
  return (
    <>
      <MenuItem icon={<ListStart size={15} />} onSelect={() => (onClose(), playNext([track]))}>
        Play Next
      </MenuItem>
      <MenuItem icon={<ListEnd size={15} />} onSelect={() => (onClose(), addToQueue([track]))}>
        Add to Queue
      </MenuItem>
      <MenuSeparator />
      {signedIn && <AccountFavorite track={track} onClose={onClose} />}
      <MenuItem icon={<ListPlus size={15} />} trailing={<ChevronRight size={14} />} onSelect={() => setView('playlists')}>
        Add to Playlist
      </MenuItem>
      {onRemoveFromPlaylist && (
        <>
          <MenuSeparator />
          <MenuItem
            icon={<Trash2 size={15} className="text-red-400" />}
            onSelect={() => {
              onClose();
              onRemoveFromPlaylist();
            }}
          >
            <span className="text-red-400">Remove from Playlist</span>
          </MenuItem>
        </>
      )}
    </>
  );
}

/**
 * The ⋯ button at the end of a track row (report §14): Play Next and Add to
 * Queue for everyone; Favorite and Add to Playlist signed in.
 */
export function TrackMenu({
  track,
  className,
  placement,
  onOpenChange,
  onRemoveFromPlaylist,
}: {
  track: Track;
  className?: string;
  /** Where the menu opens from the button; the player's sit at the bottom of the window. */
  placement?: MenuPlacement;
  /** Told when the menu opens and closes; most mounts don't need to know. */
  onOpenChange?: (open: boolean) => void;
  /** When set, displays a "Remove from Playlist" option in the menu. */
  onRemoveFromPlaylist?: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  useEffect(() => {
    onOpenChange?.(anchor !== null);
  }, [anchor, onOpenChange]);
  return (
    <>
      <button
        className={className}
        aria-label={`More options for ${track.title}`}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        data-open={anchor !== null || undefined}
        onClick={(event) => {
          event.stopPropagation();
          setAnchor(anchor ? null : event.currentTarget);
        }}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <MoreHorizontal size={18} strokeWidth={2} />
      </button>
      {anchor && (
        <Menu anchor={anchor} placement={placement} onClose={close} label={track.title}>
          <TrackMenuItems track={track} onClose={close} onRemoveFromPlaylist={onRemoveFromPlaylist} />
        </Menu>
      )}
    </>
  );
}

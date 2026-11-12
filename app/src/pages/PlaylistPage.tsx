import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Trash2 } from 'lucide-react';
import { DetailHeader } from '@/components/music/DetailHeader';
import { playList, shuffleList } from '@/components/music/play';
import { LoadError, LoadMoreError, NeedsExtension } from '@/components/music/States';
import { TrackList } from '@/components/music/TrackList';
import { useDeleteYouTubePlaylist, usePlaylist, useRemoveFromPlaylist, useSignedIn, useYouTubeReady } from '@/data/music/queries';
import { useLocalPlaylist, localPlaylists } from '@/playback/local/localPlaylists';
import { useArtworkColor } from '@/lib/artworkColor';
import { usePageTint } from '@/lib/usePageTint';
import { PlaylistSkeleton } from '@/skeletons/PageSkeletons';
import { detailFooter } from './pageStyles';
import type { HeaderInfo } from '@/data/music/types';

/** A playlist (report §14): header, then the artwork track list, loading on as you scroll. */
export default function PlaylistPage() {
  const id = decodeURIComponent(useParams().id ?? '');
  const navigate = useNavigate();
  const isLocal = id.startsWith('local_');
  const localPlaylist = useLocalPlaylist(id);

  const { missing } = useYouTubeReady();
  const playlist = usePlaylist(isLocal ? '' : id);
  const deleteYouTube = useDeleteYouTubePlaylist();
  const removeTrackYouTube = useRemoveFromPlaylist();
  const signedIn = useSignedIn();

  const header: HeaderInfo | null = isLocal
    ? localPlaylist
      ? {
          title: localPlaylist.name,
          subtitle: localPlaylist.description || 'Local Playlist • SudinChord',
          thumbnail: localPlaylist.thumbnail || (localPlaylist.tracks[0]?.thumbnail ?? null),
          meta: `${localPlaylist.tracks.length} song${localPlaylist.tracks.length === 1 ? '' : 's'} • Created ${new Date(localPlaylist.createdAt).toLocaleDateString()}`,
          artists: [],
          description: localPlaylist.description,
          explicit: false,
          library: null,
        }
      : null
    : playlist.data?.pages[0]?.header ?? null;

  usePageTint(useArtworkColor(header?.thumbnail));

  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = playlist;
  const onNearEnd = useCallback(() => {
    if (!isLocal && hasNextPage && !isFetchingNextPage && !isFetchNextPageError) void fetchNextPage();
  }, [isLocal, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);

  if (isLocal) {
    if (!localPlaylist || !header) {
      return (
        <div className="py-20 text-center type-body text-secondary">
          <p>Local playlist not found.</p>
          <button
            type="button"
            className="mt-4 rounded-full bg-pill-bg px-4 py-2 text-pill hover:opacity-90"
            onClick={() => navigate('/home')}
          >
            Back Home
          </button>
        </div>
      );
    }

    const tracks = localPlaylist.tracks;
    const context = { source: { title: header.title, type: 'playlist' as const, id } };
    return (
      <>
        <DetailHeader
          info={header}
          canPlay={tracks.length > 0}
          onPlay={() => playList(tracks, 0, context)}
          onShuffle={() => shuffleList(tracks, context)}
          extra={
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[24px] px-4 text-xs font-semibold text-red-400 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 transition-all shadow-sm cursor-pointer active:scale-95"
              title="Delete Playlist"
              onClick={() => {
                if (window.confirm(`Delete playlist "${localPlaylist.name}"?`)) {
                  localPlaylists.delete(id);
                  navigate('/home');
                }
              }}
            >
              <Trash2 size={15} strokeWidth={2} />
              <span>Delete Playlist</span>
            </button>
          }
        />
        {tracks.length === 0 ? (
          <div className="py-16 text-center text-secondary">
            <p className="type-body font-medium">This playlist is empty.</p>
            <p className="mt-1 type-callout opacity-75">Click ⋯ on any song and select "Add to Playlist" to add it here.</p>
          </div>
        ) : (
          <TrackList
            tracks={tracks}
            variant="playlist"
            source={context.source}
            onRemoveTrack={(index) => {
              localPlaylists.removeTrack(id, index);
            }}
          />
        )}
        <footer className={detailFooter}>
          <p>{header.meta}</p>
        </footer>
      </>
    );
  }

  if (missing) return <NeedsExtension />;
  if (playlist.isError && !playlist.data) return <LoadError error={playlist.error} onRetry={() => void playlist.refetch()} />;
  if (!playlist.data || !header) return <PlaylistSkeleton />;

  const tracks = playlist.data.pages.flatMap((page) => page.tracks);
  const context = { source: { title: header.title, type: 'playlist' as const, id } };
  return (
    <>
      <DetailHeader
        info={header}
        canPlay={tracks.length > 0}
        onPlay={() => playList(tracks, 0, context)}
        onShuffle={() => shuffleList(tracks, context)}
        extra={
          signedIn ? (
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[24px] px-4 text-xs font-semibold text-red-400 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 transition-all shadow-sm cursor-pointer active:scale-95"
              title="Delete Playlist"
              onClick={() => {
                if (window.confirm(`Delete playlist "${header.title}"?`)) {
                  deleteYouTube.mutate(id, {
                    onSuccess: () => navigate('/library/playlists'),
                    onError: (err) => alert(`Failed to delete playlist: ${err instanceof Error ? err.message : String(err)}`),
                  });
                }
              }}
            >
              <Trash2 size={15} strokeWidth={2} />
              <span>Delete Playlist</span>
            </button>
          ) : null
        }
      />
      <TrackList
        tracks={tracks}
        variant="playlist"
        onNearEnd={onNearEnd}
        source={context.source}
        onRemoveTrack={
          signedIn
            ? (_index, track) => {
                if (window.confirm(`Remove "${track.title}" from this playlist?`)) {
                  removeTrackYouTube.mutate({ playlistId: id, videoId: track.videoId });
                }
              }
            : undefined
        }
      />
      {isFetchingNextPage && <div className="flex justify-center py-5 type-callout text-secondary">Loading more songs…</div>}
      {playlist.isFetchNextPageError && <LoadMoreError onRetry={() => void fetchNextPage()} />}
      <footer className={detailFooter}>
        <p>{header.meta}</p>
      </footer>
    </>
  );
}

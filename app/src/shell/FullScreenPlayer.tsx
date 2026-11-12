import { Maximize, Minimize, PictureInPicture2, X } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router';
import {
  BackwardIcon,
  ForwardIcon,
  LyricsActiveIcon,
  LyricsIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  RepeatOneIcon,
  ShuffleIcon,
  UpNextIcon,
} from '@/components/icons/Transport';
import { AudioVisualizer } from '@/components/music/AudioVisualizer';
import { SleepTimerButton } from '@/components/music/SleepTimerButton';
import { VisualizerButton } from '@/components/music/VisualizerButton';
import { ExplicitBadge } from '@/components/music/ExplicitBadge';
import { FavoriteButton } from '@/components/music/FavoriteButton';
import { TrackMenu } from '@/components/music/TrackMenu';
import { albumHref } from '@/components/music/links';
import { MotionArtwork } from '@/components/music/MotionArtwork';
import { VideoSurface } from '@/components/music/VideoSurface';
import { useTrackMotion, type AppleMotion } from '@/data/apple/motionArt';
import { sizedArtwork } from '@/lib/artwork';
import { useArtworkAccent, type ArtworkAccent } from '@/lib/artworkAccent';
import { usePlayer } from '@/state/player';
import { useUi } from '@/state/ui';
import { useHasVideo, useVideo } from '@/state/video';
import { Credits, PageLink, pageLink } from './Lcd';
import { LyricsPanel } from './LyricsPanel';
import { MeshBackdrop } from './MeshBackdrop';
import { albumPageFor } from './nowPlayingLinks';
import { UpNext } from './UpNext';
import { MixWindowHighlight, NerdStats } from './NerdStats';
import { useScrubber } from './useScrubber';
import { VideoQuality } from './VideoQuality';
import { fadeForVolume, VolumeControl } from './VolumeControl';

const subscribeFullscreen = (onChange: () => void) => {
  document.addEventListener('fullscreenchange', onChange);
  return () => document.removeEventListener('fullscreenchange', onChange);
};
const getFullscreenSnapshot = () => document.fullscreenElement !== null;

function useBrowserFullScreen(): boolean {
  return useSyncExternalStore(subscribeFullscreen, getFullscreenSnapshot);
}

/** The seek line under the track's names: thicker on hover, with glowing dynamic artwork accent. */
function Scrubber({ accent }: { accent: ArtworkAccent }) {
  const { bar, elapsed, remaining, mixLabel, dragging, handlers } = useScrubber();
  return (
    <div className="group/scrub mt-3.5" data-dragging={dragging || undefined}>
      {/* A taller hit area than the line it carries. */}
      <div className="group/hit flex h-4 cursor-pointer touch-none items-center" {...handlers}>
        <div
          className="relative h-1 flex-1 overflow-hidden rounded-[999px] bg-white/10 transition-[height] duration-120 ease-in group-hover/hit:h-2 group-data-dragging/scrub:h-2"
          aria-hidden="true"
        >
          <MixWindowHighlight />
          <div
            ref={bar}
            style={{
              background: `linear-gradient(90deg, ${accent.secondary}, ${accent.primary})`,
              boxShadow: `0 0 12px ${accent.glow}`,
            }}
            className="relative size-full origin-left scale-x-(--progress) transition-opacity duration-120 ease-in [--progress:0]"
          />
        </div>
      </div>
      <div className="relative mt-0.5 flex justify-between type-[500_11px/14px] tabular-nums text-tertiary">
        <span ref={elapsed} />
        <span ref={mixLabel} className="pointer-events-none absolute inset-x-0 text-center text-secondary opacity-0" aria-hidden="true">
          Mixing
        </span>
        <span ref={remaining} />
      </div>
    </div>
  );
}

/** 3D interactive stage with dynamic radiosity ambient halo, floor reflection, and cursor parallax tilt. */
function ArtworkStage({
  artworkUrl,
  playing,
  video,
  column,
  theater,
  motion,
  accent,
}: {
  artworkUrl: string | null;
  playing: boolean;
  video: boolean;
  column: boolean;
  theater: boolean;
  motion: AppleMotion | null;
  accent: ArtworkAccent;
}) {
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, glareX: 50, glareY: 50, hovered: false });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (video) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const rx = -(y - 0.5) * 12;
    const ry = (x - 0.5) * 12;
    setTilt({ rx, ry, glareX: x * 100, glareY: y * 100, hovered: true });
  };

  const handlePointerLeave = () => {
    setTilt((prev) => ({ ...prev, rx: 0, ry: 0, hovered: false }));
  };

  return (
    <div
      className={`relative w-(--art) rounded-[14px] transition-transform duration-450 ease-[cubic-bezier(0.34,1.3,0.64,1)] motion-reduce:transition-none ${
        video ? ' aspect-video overflow-hidden bg-black' : ' aspect-square'
      }${playing ? '' : ' scale-92'}${column ? ' max-md:hidden' : ''}${theater ? ' hidden' : ''}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{ perspective: 900 }}
    >
      {/* 3D Container with tilt */}
      <div
        className="relative size-full rounded-[inherit] transition-transform duration-200 ease-out"
        style={{
          transform: !video && tilt.hovered ? `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) scale3d(1.02, 1.02, 1.02)` : 'rotateX(0deg) rotateY(0deg)',
          transformStyle: 'preserve-3d',
        }}
      >
        {artworkUrl && (
          <>
            {/* Deep Ambient Radiosity Glow */}
            <img
              key={`deep-glow-${artworkUrl}`}
              className={`${artworkLayer} -z-2 translate-y-4 scale-102 blur-[48px] saturate-[2.4] data-loaded:opacity-75`}
              src={sizedArtwork(artworkUrl, 80)}
              alt=""
              referrerPolicy="no-referrer"
              decoding="async"
              onLoad={(e) => e.currentTarget.setAttribute('data-loaded', '')}
            />

            {/* Core Glow */}
            <img
              key={`core-glow-${artworkUrl}`}
              className={`${artworkLayer} -z-1 translate-y-2 scale-98 blur-[18px] saturate-200 data-loaded:opacity-50`}
              src={sizedArtwork(artworkUrl, 120)}
              alt=""
              referrerPolicy="no-referrer"
              decoding="async"
              onLoad={(e) => e.currentTarget.setAttribute('data-loaded', '')}
            />

            {/* Main Cover Artwork */}
            <img
              key={artworkUrl}
              className={`${artworkLayer} bg-[#ffffff12] shadow-[0_16px_40px_rgba(0,0,0,0.45)] data-loaded:opacity-100`}
              style={{
                boxShadow: `0 18px 45px rgba(0,0,0,0.45), 0 0 45px ${accent.glow}`,
              }}
              src={sizedArtwork(artworkUrl, 600)}
              alt=""
              referrerPolicy="no-referrer"
              decoding="async"
              onLoad={(e) => e.currentTarget.setAttribute('data-loaded', '')}
            />

            {/* Specular Interactive Glass Shine on Hover */}
            {!video && tilt.hovered && (
              <div
                className="pointer-events-none absolute inset-0 z-1 size-full rounded-[inherit] transition-opacity duration-300"
                style={{
                  background: `radial-gradient(circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(255,255,255,0.22) 0%, transparent 65%)`,
                }}
              />
            )}
          </>
        )}

        {/* Apple Motion Artwork */}
        {motion && (
          <MotionArtwork
            key={motion.url}
            motion={motion}
            className="absolute inset-0 size-full rounded-[inherit] object-cover opacity-0 transition-opacity duration-600 ease-in data-ready:opacity-100"
            playing={playing}
          />
        )}
        {video && !theater && <VideoSurface className="absolute inset-0" />}
      </div>

      {/* Radiant Sound Aura beneath artwork */}
      {!video && artworkUrl && (
        <div
          className="pointer-events-none absolute -bottom-1 inset-x-8 h-2 rounded-full blur-md transition-opacity duration-300"
          style={{
            background: accent.primary,
            boxShadow: `0 0 16px ${accent.glow}`,
            opacity: playing ? 0.85 : 0.25,
          }}
        />
      )}
    </div>
  );
}

const transportButton =
  'grid place-items-center rounded-full transition-[background-color,scale] duration-100 ease-in enabled:hover:bg-quinary enabled:active:scale-90 disabled:opacity-40';
// Shuffle and repeat, when on: full white on the mesh, where red would clash.
const toggle = `${transportButton} size-9 text-tertiary aria-pressed:text-primary`;
const skip = `${transportButton} size-12 text-primary`;

/** Shuffle, previous, play/pause, next, repeat. No volume: the pill keeps that. */
function Transport() {
  const hasTrack = usePlayer((s) => s.nowPlaying !== null);
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'buffering');
  const hasNext = usePlayer((s) => s.index + 1 < s.queue.length || s.repeat !== 'off' || (s.autoplay && s.index >= 0));
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const { togglePlay, next, previous, toggleShuffle, cycleRepeat } = usePlayer.getState();

  return (
    <div className="mx-auto mt-[clamp(8px,1.6vh,16px)] mb-0 flex h-13 w-[min(100%,315px)] items-center justify-between">
      <button className={toggle} aria-label="Shuffle" aria-pressed={shuffle} onClick={toggleShuffle}>
        <ShuffleIcon size={30} />
      </button>
      <button className={skip} disabled={!hasTrack} aria-label="Previous" onClick={previous}>
        <BackwardIcon size={40} />
      </button>
      <button className={`${transportButton} size-14 text-primary`} disabled={!hasTrack} aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
        {playing ? <PauseIcon size={48} /> : <PlayIcon size={48} />}
      </button>
      <button className={skip} disabled={!hasTrack || !hasNext} aria-label="Next" onClick={next}>
        <ForwardIcon size={40} />
      </button>
      <button
        className={toggle}
        aria-label={repeat === 'one' ? 'Repeat one' : repeat === 'all' ? 'Repeat all' : 'Repeat'}
        aria-pressed={repeat !== 'off'}
        onClick={cycleRepeat}
      >
        {repeat === 'one' ? <RepeatOneIcon size={30} /> : <RepeatIcon size={30} />}
      </button>
    </div>
  );
}

// Close, browser full screen, the column toggles and the speaker, in the corners.
const chromeButton =
  'grid size-8 place-items-center rounded-full text-secondary transition-[background-color,color] duration-100 ease-in hover:bg-quinary hover:text-primary';
const chrome = `absolute z-1 ${chromeButton}`;
const artworkLayer = 'absolute inset-0 size-full rounded-[inherit] object-cover opacity-0 transition-opacity duration-300 ease-in';

/** How long the pointer can rest before a playing music video hides its controls. */
const IDLE_MS = 3000;

/**
 * The full-screen player (report §7): the artwork on the left with the
 * track's names, the seek line and the transport under it; the lyrics, the
 * same am-lyrics panel as the side panel's, on the right; all over a mesh
 * gradient of the artwork's colours. With the lyrics closed, the artwork
 * column sits in the middle on its own, as Apple's does.
 *
 * A music video plays as Apple's do: on its own, it fills the window with
 * the names and transport over its foot, fading out while the pointer rests;
 * beside the lyrics or Up Next, it takes the artwork's place at 16:9.
 */
export function FullScreenPlayer() {
  const nowPlaying = usePlayer((s) => s.nowPlaying);
  // The queue's row for what's playing: it carries the album and each artist's channel.
  const track = usePlayer((s) => {
    const entry = s.queue[s.index]?.track;
    return entry && entry.videoId === s.nowPlaying?.videoId ? entry : null;
  });
  // Apple's animated sleeve over the cover, as the phone's now-playing shows it.
  const motion = useTrackMotion(nowPlaying?.title, nowPlaying?.artist, track?.album?.name);
  const { pathname } = useLocation();
  const openedAt = useRef(pathname);
  const playing = usePlayer((s) => s.status === 'playing' || s.status === 'buffering');
  const accent = useArtworkAccent(nowPlaying?.artworkUrl);
  const setFullScreen = useUi((s) => s.setFullScreen);
  const video = useHasVideo(nowPlaying?.videoId);
  // The right-hand column: the lyrics, Up Next, or nothing. Lyrics toggle bottom left, Up Next bottom right.
  // A music video opens on its own, without the lyrics.
  const [panel, setPanel] = useState<'lyrics' | 'queue' | null>(() =>
    nowPlaying && useVideo.getState().videoId === nowPlaying.videoId ? null : 'lyrics',
  );
  // Once the listener picks a column, a video arriving late doesn't take it away.
  const picked = useRef(false);
  const [idle, setIdle] = useState(false);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const browserFullScreen = useBrowserFullScreen();
  const close = useRef<HTMLButtonElement>(null);
  // Whether this player put the page in the browser's full screen, so closing it leaves it again.
  const enteredBrowserFullScreen = useRef(false);

  // The column follows the toggle alone: whether this track has lyrics, and
  // from which provider, is the panel's own business to say.
  const showLyrics = panel === 'lyrics';
  const showQueue = panel === 'queue';
  const togglePanel = (p: 'lyrics' | 'queue') => {
    picked.current = true;
    setPanel((on) => (on === p ? null : p));
  };

  useEffect(() => {
    if (video && !picked.current) setPanel(null);
  }, [video]);

  const wake = () => {
    setIdle(false);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  };
  useEffect(() => {
    wake();
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    close.current?.focus({ preventScroll: true });
    return () => {
      if (enteredBrowserFullScreen.current && document.fullscreenElement) void document.exitFullscreen();
      opener?.focus({ preventScroll: true });
    };
  }, []);

  // A title, artist or album link went somewhere: get out of the way so the page shows.
  useEffect(() => {
    if (pathname !== openedAt.current) setFullScreen(false);
  }, [pathname, setFullScreen]);

  // Nothing left to show once the queue ends.
  useEffect(() => {
    if (!nowPlaying) setFullScreen(false);
  }, [nowPlaying, setFullScreen]);

  const toggleBrowserFullScreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      // The whole page, not this overlay: menus and dialogs portal to <body> and must stay visible.
      void document.documentElement.requestFullscreen().then(
        () => (enteredBrowserFullScreen.current = true),
        () => undefined,
      );
    }
  };

  if (!nowPlaying) return null;
  const { videoId, title, artist } = nowPlaying;
  const album = track?.album ?? null;
  // With a right-hand column; on narrow windows that column fills the screen and the controls sit under it, without the artwork.
  const column = showLyrics || showQueue;
  // A music video on its own fills the window.
  const theater = video && !column;
  // ...and hides the controls and the pointer while it plays undisturbed.
  const hidden = theater && playing && idle ? ' pointer-events-none opacity-0' : '';
  const corner = `${chrome} transition-[background-color,color,opacity] duration-300${hidden}`;

  return (
    <div
      // Over everything but menus and dialogs, which portal above it. The on-dark colours come from tokens.css (data-full-screen).
      // --art, the artwork's side: Apple's 461px at 1440px wide, and never taller than the screen leaves room for.
      className="fixed inset-0 z-[calc(var(--z-contextual-menus)-2)] isolate animate-enter overflow-hidden text-primary [--art:min(32vw,calc(100dvh-330px),720px)] motion-reduce:[animation-name:fade-in] max-md:[--art:min(84vw,calc(100dvh-330px),420px)]"
      role="dialog"
      aria-modal="true"
      aria-label="Now Playing"
      data-full-screen
      data-paused={!playing || undefined}
      onPointerMove={wake}
      onPointerDown={wake}
      onKeyDown={wake}
      style={theater && playing && idle ? { cursor: 'none' } : undefined}
    >
      <MeshBackdrop artworkUrl={nowPlaying.artworkUrl} playing={playing} />
      {theater && (
        <div className="absolute inset-0 animate-fade-in bg-black">
          <VideoSurface fit="contain" className="size-full" />
        </div>
      )}

      <button ref={close} className={`${corner} top-12 left-5`} aria-label="Close" onClick={() => setFullScreen(false)}>
        <X size={20} />
      </button>
      {/* Top right actions: Video quality, Visualizer, Sleep Timer, PiP, Fullscreen */}
      <div className={`absolute top-12 right-5 z-1 flex items-center gap-2.5 transition-[background-color,color,opacity] duration-300${hidden}`}>
        {video && <VideoQuality />}
        <VisualizerButton className={chromeButton} placement="below-end" />
        <SleepTimerButton className={chromeButton} placement="below-end" />
        <button
          className={chromeButton}
          aria-label="Mini Player (Picture-in-Picture)"
          title="Mini Player (Ctrl+Alt+M)"
          onClick={() => {
            const ep = (window as unknown as {
              electronPlatform?: {
                toggleMiniPlayer?: (opts?: { minimizeMain?: boolean }) => void;
              };
            }).electronPlatform;
            ep?.toggleMiniPlayer?.({ minimizeMain: true });
          }}
        >
          <PictureInPicture2 size={18} strokeWidth={2.2} />
        </button>
        {document.fullscreenEnabled && (
          <button
            className={chromeButton}
            aria-label={browserFullScreen ? 'Exit full screen' : 'Enter full screen'}
            onClick={toggleBrowserFullScreen}
          >
            {browserFullScreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        )}
      </div>

      {/* Apple's grid areas "controls lyrics": the artwork column, then the lyrics. */}
      <div
        className={
          theater
            ? `absolute inset-x-0 bottom-0 flex justify-center bg-[linear-gradient(to_top,rgb(0_0_0/0.72),rgb(0_0_0/0.35)_55%,transparent)] px-6 pt-32 pb-16 transition-opacity duration-300${hidden}`
            : `grid h-full items-center justify-center gap-x-[clamp(32px,5vw,96px)] px-[clamp(20px,5vw,80px)] py-16 max-md:px-6 max-md:pb-18 ${
                column
                  ? 'grid-cols-[var(--art)_minmax(0,48vw)] max-md:grid-cols-[minmax(0,1fr)] max-md:grid-rows-[minmax(0,1fr)_auto] max-md:items-stretch max-md:gap-y-4'
                  : 'grid-cols-[var(--art)]'
              }`
        }
        data-lyrics={column || undefined}
      >
        <section
          className={
            theater ? 'flex w-[min(720px,100%)] min-w-0 flex-col' : `flex w-(--art) min-w-0 flex-col${column ? ' max-md:order-2 max-md:w-full' : ''}`
          }
          aria-label="Player"
        >
          {/* 3D Interactive Artwork Stage with ambient glow and floor reflection */}
          <ArtworkStage
            artworkUrl={nowPlaying.artworkUrl}
            playing={playing}
            video={video}
            column={column}
            theater={theater}
            motion={motion}
            accent={accent}
          />

          <div className={`flex items-center gap-3${theater ? '' : ' mt-[clamp(20px,3.2vh,32px)]'}${column ? ' max-md:mt-0' : ''}`}>
            {/* As the mini player's: the title opens the album, each credited name its artist. */}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex min-w-0 items-center">
                <PageLink
                  className={`min-w-0 max-w-full self-start truncate type-[600_17px/22px] ${pageLink}`}
                  href={albumHref(album?.id ?? null)}
                  resolve={() => albumPageFor(videoId, album, [title, artist].filter(Boolean).join(' '))}
                >
                  {title}
                </PageLink>
                {track?.explicit && <ExplicitBadge size={14} />}
                {nowPlaying?.stream?.codec === 'FLAC' && (
                  <span
                    className="ml-2.5 inline-flex items-center text-[10px] font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 uppercase"
                    title={nowPlaying.streamInfo ?? 'Lossless Audio'}
                  >
                    Lossless
                  </span>
                )}
              </div>
              <span className="truncate type-title-3 text-secondary">
                {artist && <Credits videoId={videoId} line={artist} artists={track?.artists ?? []} className={pageLink} />}
                {artist && album?.name && ' — '}
                {album?.name && (
                  <PageLink
                    className={pageLink}
                    href={albumHref(album.id ?? null)}
                    resolve={() => albumPageFor(videoId, album, [title, artist].filter(Boolean).join(' '))}
                  >
                    {album.name}
                  </PageLink>
                )}
              </span>
              <NerdStats />
            </div>
            <FavoriteButton
              videoId={nowPlaying.videoId}
              className="grid size-8 flex-none place-items-center rounded-full bg-quinary text-primary hover:bg-quaternary"
              size={18}
            />
            {track && (
              <TrackMenu
                track={track}
                className="grid size-8 flex-none place-items-center rounded-full bg-quinary text-primary hover:bg-quaternary"
                placement="above-end"
              />
            )}
          </div>

          <Scrubber accent={accent} />
          <Transport />
          <AudioVisualizer className="mt-4 w-full rounded-[10px]" height={44} barCount={40} />
        </section>

        {showLyrics && (
          <section className="flex min-h-0 min-w-0 animate-fade-in self-stretch overflow-visible" aria-label="Lyrics">
            <LyricsPanel variant="full" />
          </section>
        )}
        {showQueue && (
          // Up Next in the right-hand column: the side panel's list, laid out as a column.
          <section
            className="flex min-h-0 animate-fade-in flex-col self-stretch [mask-image:linear-gradient(180deg,#000_calc(100%-80px),transparent)]"
            aria-label="Up Next"
          >
            <UpNext />
          </section>
        )}
      </div>

      <button
        className={`${corner} bottom-5 left-5 aria-pressed:text-primary`}
        aria-label="Lyrics"
        aria-pressed={showLyrics}
        onClick={() => togglePanel('lyrics')}
      >
        {showLyrics ? <LyricsActiveIcon size={18} /> : <LyricsIcon size={18} />}
      </button>
      {/* Up Next, with the speaker beside it: the level slides in over Up Next, as it does in the pill. */}
      <div
        className={`group/actions absolute right-5 bottom-5 z-1 flex items-center [--volume-gap:36px] transition-opacity duration-300${hidden}`}
        data-volume-open={volumeOpen || undefined}
        onPointerLeave={() => setVolumeOpen(false)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setVolumeOpen(false);
        }}
      >
        <button
          className={`${chromeButton} ${fadeForVolume} aria-pressed:text-primary`}
          aria-label="Up Next"
          aria-pressed={showQueue}
          onClick={() => togglePanel('queue')}
        >
          <UpNextIcon size={18} />
        </button>
        <VolumeControl open={volumeOpen} onOpen={() => setVolumeOpen(true)} className={chromeButton} iconSize={18} />
      </div>
    </div>
  );
}

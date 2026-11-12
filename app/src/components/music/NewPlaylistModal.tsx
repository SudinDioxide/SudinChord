import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { FolderPlus, X, Loader2 } from 'lucide-react';
import { SiYoutube } from 'react-icons/si';
import { useNewPlaylistModal, type PlaylistPlatform } from '@/state/newPlaylistModal';
import { localPlaylists } from '@/playback/local/localPlaylists';
import { useCreateYouTubePlaylist, useSignedIn } from '@/data/music/queries';

export function NewPlaylistModal() {
  const { isOpen, initialTrack, defaultPlatform, close } = useNewPlaylistModal();
  const navigate = useNavigate();
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [platform, setPlatform] = useState<PlaylistPlatform>(defaultPlatform);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const youtubeSignedIn = useSignedIn();
  const createYouTube = useCreateYouTubePlaylist();

  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setPlatform(defaultPlatform === 'youtube' ? 'youtube' : 'local');
      setError(null);
      setIsSubmitting(false);

      // Explicitly focus input after render
      const timer = setTimeout(() => {
        nameInputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, defaultPlatform]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter a playlist name');
      nameInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      if (platform === 'local') {
        const pl = localPlaylists.create(trimmed, description, initialTrack ? [initialTrack] : []);
        close();
        navigate(`/playlist/${pl.id}`);
      } else if (platform === 'youtube') {
        if (!youtubeSignedIn) {
          throw new Error('Please sign in to YouTube Music first to create YouTube playlists.');
        }
        const videoIds = initialTrack ? [initialTrack.videoId] : [];
        const playlistId = await createYouTube.mutateAsync({
          title: trimmed,
          description,
          videoIds,
        });
        close();
        navigate(`/playlist/VL${playlistId}`);
      }
    } catch (err: unknown) {
      console.error('[NewPlaylistModal] Creation failed:', err);
      setError(err instanceof Error ? err.message : String(err));
      setIsSubmitting(false);
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New Playlist"
      className="fixed inset-0 z-(--z-modal) flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={close}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') close();
      }}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-[#1c1c21] border border-white/10 shadow-2xl p-6 text-primary pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="absolute top-4 right-4 p-1 rounded-full text-secondary hover:text-primary hover:bg-white/10 transition-colors cursor-pointer"
          onClick={close}
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        <h2 className="text-xl font-bold tracking-tight mb-1 text-white">New Playlist</h2>
        <p className="text-xs text-secondary mb-5">
          {initialTrack
            ? `Creating playlist with "${initialTrack.title}"`
            : 'Choose where you want to create your playlist'}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1.5">
              Playlist Name
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chill Vibes, Rock Classics"
              autoComplete="off"
              spellCheck={false}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] focus:bg-white/[0.14] border border-white/15 focus:border-emerald-500 focus:outline-none text-sm text-white placeholder:text-secondary/70 transition-colors cursor-text select-text"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-1.5">
              Description (Optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Give your playlist a description"
              autoComplete="off"
              spellCheck={false}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.12] focus:bg-white/[0.14] border border-white/15 focus:border-emerald-500 focus:outline-none text-sm text-white placeholder:text-secondary/70 transition-colors cursor-text select-text"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-2">
              Destination
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* Local */}
              <button
                type="button"
                onClick={() => setPlatform('local')}
                className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-center transition-all cursor-pointer ${
                  platform === 'local'
                    ? 'border-emerald-500 bg-emerald-500/15 text-white shadow-sm'
                    : 'border-white/10 bg-white/[0.04] text-secondary hover:bg-white/[0.08]'
                }`}
              >
                <FolderPlus size={24} className={platform === 'local' ? 'text-emerald-400' : ''} />
                <span className="mt-2 text-xs font-semibold">Local Playlist</span>
                <span className="text-[10px] opacity-60">Stored offline on device</span>
              </button>

              {/* YouTube */}
              <button
                type="button"
                onClick={() => setPlatform('youtube')}
                className={`flex flex-col items-center justify-center p-3.5 rounded-xl border text-center transition-all cursor-pointer ${
                  platform === 'youtube'
                    ? 'border-red-500 bg-red-500/15 text-white shadow-sm'
                    : 'border-white/10 bg-white/[0.04] text-secondary hover:bg-white/[0.08]'
                }`}
              >
                <SiYoutube size={24} className={platform === 'youtube' ? 'text-red-500' : ''} />
                <span className="mt-2 text-xs font-semibold">YouTube Music</span>
                <span className="text-[10px] opacity-60">{youtubeSignedIn ? 'Connected' : 'Sign in required'}</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/25 text-red-200 text-xs">
              <p className="font-semibold">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 mt-2">
            <button
              type="button"
              onClick={close}
              className="px-4 py-2 rounded-full text-xs font-semibold text-secondary hover:text-primary transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
            >
              {isSubmitting && <Loader2 size={13} className="animate-spin" />}
              Create Playlist
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}


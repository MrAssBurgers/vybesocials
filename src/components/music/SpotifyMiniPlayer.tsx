import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { X, Play, Pause, SkipBack, SkipForward, ExternalLink, ListMusic, ArrowLeft, Loader2, Music2 } from 'lucide-react';
import { useSpotifyControl } from '@/hooks/useSpotifyControl';
import { useSpotifyPlaylists } from '@/hooks/useSpotifyPlaylists';
import type { LiveMusicPresence } from '@/hooks/useLiveMusicPresence';
import { cn } from '@/lib/utils';

interface Props {
  presence: LiveMusicPresence | null;
  onClose: () => void;
}

/**
 * Expanded Spotify mini-player. Controls the user's real Spotify playback
 * via the spotify-control edge function. Includes a playlists panel.
 */
export function SpotifyMiniPlayer({ presence, onClose }: Props) {
  const { control, loading } = useSpotifyControl();
  const [view, setView] = useState<'player' | 'playlists'>('player');
  const [optimisticPlaying, setOptimisticPlaying] = useState<boolean | null>(null);
  const { playlists, loading: loadingPlaylists, error: playlistsError, status: playlistsStatus, refresh: refreshPlaylists } = useSpotifyPlaylists(view === 'playlists');

  const reconnectSpotify = () => {
    window.open('/settings?connect=spotify', '_blank', 'noopener,noreferrer');
  };

  const isPlaying = optimisticPlaying ?? !!presence?.is_playing;

  const handlePlayPause = async () => {
    const next = !isPlaying;
    setOptimisticPlaying(next);
    const ok = await control({ action: next ? 'play' : 'pause' });
    if (!ok) setOptimisticPlaying(!next);
    setTimeout(() => setOptimisticPlaying(null), 1500);
  };

  const handleNext = async () => { await control({ action: 'next' }); };
  const handlePrev = async () => { await control({ action: 'previous' }); };

  const handleOpenSpotify = () => {
    if (presence?.track_url) window.open(presence.track_url, '_blank', 'noopener,noreferrer');
  };

  const handlePlaylistTap = async (id: string) => {
    const ok = await control({ action: 'start_playlist', playlist_id: id });
    if (ok) setView('player');
  };

  return (
    <motion.div
      key="mini-player"
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className="fixed inset-x-0 bottom-[calc(6.5rem+env(safe-area-inset-bottom))] z-50 mx-auto w-[min(340px,calc(100vw-24px))] rounded-3xl bg-card border border-border shadow-2xl shadow-black/40 overflow-hidden ring-1 ring-[#1DB954]/30"
      role="dialog"
      aria-label="Spotify mini player"
    >
      {/* Soft Spotify glow */}
      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-[#1DB954]/15 blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="relative flex items-center justify-between px-4 pt-3 pb-2">
        {view === 'playlists' ? (
          <button onClick={() => setView('player')} className="p-1 rounded-full hover:bg-foreground/10 active:scale-95 transition" aria-label="Back">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
        ) : (
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#1DB954]">
            {view === 'player' ? 'Now Playing' : 'Playlists'}
          </span>
        )}
        {view === 'playlists' && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#1DB954]">Your Playlists</span>
        )}
        <button onClick={onClose} className="p-1 rounded-full hover:bg-foreground/10 active:scale-95 transition" aria-label="Close">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      <AnimatePresence mode="wait">
        {view === 'player' ? (
          <motion.div
            key="player"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
            className="relative px-4 pb-4"
          >
            <div className="flex items-center gap-3">
              <div className="relative w-16 h-16 flex-shrink-0 rounded-xl overflow-hidden shadow-lg bg-muted">
                {presence?.album_art_url ? (
                  <img src={presence.album_art_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Music2 className="w-6 h-6 text-muted-foreground" /></div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-foreground truncate">{presence?.title || 'Nothing playing'}</p>
                <p className="text-xs text-muted-foreground truncate">{presence?.artist}{presence?.album ? ` · ${presence.album}` : ''}</p>
              </div>
            </div>

            {/* Transport */}
            <div className="flex items-center justify-center gap-4 mt-4">
              <button
                onClick={handlePrev}
                disabled={loading}
                className="w-10 h-10 rounded-full inline-flex items-center justify-center text-foreground/90 hover:bg-foreground/10 active:scale-90 transition disabled:opacity-50"
                aria-label="Previous"
              >
                <SkipBack className="w-5 h-5 fill-current" />
              </button>
              <button
                onClick={handlePlayPause}
                disabled={loading}
                className="w-14 h-14 rounded-full inline-flex items-center justify-center bg-[#1DB954] hover:bg-[#1ed760] text-black active:scale-90 transition shadow-lg shadow-[#1DB954]/30 disabled:opacity-60"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {loading ? (
                  <Loader2 className="w-6 h-6 animate-spin" />
                ) : isPlaying ? (
                  <Pause className="w-6 h-6 fill-current" />
                ) : (
                  <Play className="w-6 h-6 fill-current ml-0.5" />
                )}
              </button>
              <button
                onClick={handleNext}
                disabled={loading}
                className="w-10 h-10 rounded-full inline-flex items-center justify-center text-foreground/90 hover:bg-foreground/10 active:scale-90 transition disabled:opacity-50"
                aria-label="Next"
              >
                <SkipForward className="w-5 h-5 fill-current" />
              </button>
            </div>

            {/* Bottom pills */}
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={handleOpenSpotify}
                className="flex-1 h-9 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 bg-foreground/5 hover:bg-foreground/10 border border-border/30 text-foreground/90 active:scale-95 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" /> Open Spotify
              </button>
              <button
                onClick={() => setView('playlists')}
                className="flex-1 h-9 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 bg-foreground/5 hover:bg-foreground/10 border border-border/30 text-foreground/90 active:scale-95 transition"
              >
                <ListMusic className="w-3.5 h-3.5" /> Playlists
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="playlists"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.2 }}
            className="relative px-2 pb-3"
          >
            <div className="max-h-[280px] overflow-y-auto overscroll-contain touch-pan-y px-2">
              {loadingPlaylists && !playlists?.length ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground text-xs">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading playlists…
                </div>
              ) : playlistsError ? (
                <div className="py-8 text-center text-xs text-muted-foreground">{playlistsError}</div>
              ) : !playlists || playlists.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">No playlists yet</div>
              ) : (
                <ul className="space-y-1">
                  {playlists.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => handlePlaylistTap(p.id)}
                        className={cn(
                          'w-full flex items-center gap-3 p-2 rounded-xl hover:bg-foreground/5 active:scale-[0.98] transition text-left',
                          loading && 'opacity-60 pointer-events-none'
                        )}
                      >
                        <div className="w-10 h-10 rounded-md bg-muted overflow-hidden flex-shrink-0">
                          {p.image ? <img src={p.image} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><ListMusic className="w-4 h-4 text-muted-foreground" /></div>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground truncate">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{p.tracks} tracks{p.owner ? ` · ${p.owner}` : ''}</p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

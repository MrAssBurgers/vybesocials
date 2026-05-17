import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLiveMusicPresence } from '@/hooks/useLiveMusicPresence';
import { LiveSpotifyWaveform } from '@/components/music/LiveSpotifyWaveform';
import { providerTheme } from '@/components/music/providerTheme';
import { SpotifyMiniPlayer } from '@/components/music/SpotifyMiniPlayer';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  /** When true, render as a fixed floating pill near the bottom of the screen */
  floating?: boolean;
}

/**
 * Discord-style "Listening to / Watching on …" pill for the signed-in user.
 * Album art lives on the RIGHT; track info + waveform on the LEFT.
 * Tap to expand into a full mini-player (Spotify only — other providers fall back to opening the track).
 */
export function SelfNowPlayingPill({ className, floating = false }: Props) {
  const { user } = useAuth();
  const presence = useLiveMusicPresence(user?.id);
  const [dismissedTrackId, setDismissedTrackId] = useState<string | null>(null);
  const [miniOpen, setMiniOpen] = useState(false);

  const visible = !!presence?.is_playing && !!presence?.title;
  const trackId = presence?.track_id ?? presence?.title ?? null;
  const showing = visible && trackId !== dismissedTrackId;
  const theme = providerTheme(presence?.provider);
  const isSpotify = presence?.provider === 'spotify';

  const handlePillTap = (e: React.MouseEvent) => {
    if (isSpotify) {
      e.preventDefault();
      setMiniOpen((v) => !v);
    }
    // Non-spotify providers: anchor still opens track_url
  };

  return (
    <>
      <AnimatePresence>
        {showing && (
          <motion.a
            href={isSpotify ? undefined : (presence?.track_url || undefined)}
            onClick={handlePillTap}
            target={isSpotify ? undefined : '_blank'}
            rel="noreferrer noopener"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'group flex items-center gap-2.5 rounded-full bg-card border border-border shadow-lg shadow-black/30 pl-3 pr-1.5 py-1.5 max-w-[280px] cursor-pointer',
              'ring-1 transition-all',
              theme.ring,
              theme.ringHover,
              floating && 'fixed left-1/2 -translate-x-1/2 bottom-[88px] z-40',
              className,
            )}
            aria-label={isSpotify ? 'Open Spotify mini player' : theme.label}
          >
            {/* LEFT: text + waveform */}
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <LiveSpotifyWaveform tempo={presence?.tempo} energy={presence?.energy} isPlaying={!!presence?.is_playing} height={10} bars={4} color={theme.color} />
                <span className="text-[10px] font-bold tracking-wide uppercase" style={{ color: theme.color }}>
                  {theme.label}
                </span>
              </div>
              <span className="text-xs text-foreground truncate font-medium">
                {presence?.title}
                {presence?.artist ? <span className="text-muted-foreground"> · {presence.artist}</span> : null}
              </span>
            </div>

            {/* RIGHT: album art */}
            {presence?.album_art_url ? (
              <img
                src={presence.album_art_url}
                alt=""
                className="w-9 h-9 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: `${theme.color}33` }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: theme.color }} />
              </div>
            )}

            {/* Dismiss — only shown on hover for desktop, always present for accessibility */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDismissedTrackId(trackId);
                setMiniOpen(false);
              }}
              className="ml-0.5 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95 transition flex-shrink-0 opacity-60 group-hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="w-3 h-3" />
            </button>
          </motion.a>
        )}
      </AnimatePresence>

      {/* Backdrop + Mini Player — portaled to body to escape transformed ancestors */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {miniOpen && isSpotify && showing && (
            <>
              <motion.div
                key="mini-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/30"
                onClick={() => setMiniOpen(false)}
              />
              <SpotifyMiniPlayer presence={presence} onClose={() => setMiniOpen(false)} />
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

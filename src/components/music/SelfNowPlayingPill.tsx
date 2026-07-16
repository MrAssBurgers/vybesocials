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
        {showing && !miniOpen && (
          <motion.button
            type="button"
            onClick={(e) => {
              if (isSpotify) {
                e.preventDefault();
                setMiniOpen(true);
              } else if (presence?.track_url) {
                void import('@/lib/externalLinkGuard').then(({ promptExternalLink }) =>
                  promptExternalLink(presence.track_url!),
                );
              }
            }}
            initial={{ opacity: 0, y: 12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.9 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'group flex items-center gap-2.5 rounded-2xl bg-card border border-border shadow-lg shadow-black/30 pl-1.5 pr-2 py-1.5 max-w-[230px] cursor-pointer',
              'ring-1 transition-all',
              theme.ring,
              theme.ringHover,
                // iOS safe area: some floating controls were pushed too high by
                // overcompensating with env(safe-area-inset-bottom). Use measured
                // --sab and a smaller base offset.
                floating && 'fixed left-3 bottom-[calc(4rem+var(--sab,env(safe-area-inset-bottom,0px)))] z-40',
              className,
            )}
            aria-label={isSpotify ? 'Open Spotify mini player' : theme.label}
          >
            {/* Album art */}
            {presence?.album_art_url ? (
              <img
                src={presence.album_art_url}
                alt=""
                className="w-9 h-9 rounded-xl object-cover flex-shrink-0"
              />
            ) : (
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${theme.color}33` }}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: theme.color }} />
              </div>
            )}

            {/* Two-line track info */}
            <div className="flex flex-col min-w-0 flex-1 text-left">
              <div className="flex items-center gap-1.5">
                <LiveSpotifyWaveform tempo={presence?.tempo} energy={presence?.energy} isPlaying={!!presence?.is_playing} height={8} bars={3} color={theme.color} />
                <span className="text-[9px] font-bold tracking-wider uppercase truncate" style={{ color: theme.color }}>
                  {theme.label}
                </span>
              </div>
              <span className="text-[13px] leading-tight font-semibold text-foreground truncate">
                {presence?.title}
              </span>
              {presence?.artist && (
                <span className="text-[10px] leading-tight text-muted-foreground truncate">
                  {presence.artist}
                </span>
              )}
            </div>

            {/* Dismiss the track entirely */}
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setDismissedTrackId(trackId);
                setMiniOpen(false);
              }}
              className="ml-0.5 w-6 h-6 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95 transition flex items-center justify-center flex-shrink-0 opacity-70 group-hover:opacity-100"
              aria-label="Dismiss"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          </motion.button>
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
                className="fixed inset-0 z-40 bg-black/40"
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

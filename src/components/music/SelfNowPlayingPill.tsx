import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLiveMusicPresence } from '@/hooks/useLiveMusicPresence';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  /** When true, render as a fixed floating pill near the bottom of the screen */
  floating?: boolean;
}

/**
 * Discord-style "Listening to Spotify" pill for the signed-in user.
 * Reads the user's own live_music_presence row (upserted by useSpotifyPresence
 * every ~8s) and renders a compact, dismissible widget. Hidden when nothing
 * is playing.
 */
export function SelfNowPlayingPill({ className, floating = false }: Props) {
  const { user } = useAuth();
  const presence = useLiveMusicPresence(user?.id);
  const [dismissedTrackId, setDismissedTrackId] = useState<string | null>(null);

  const visible = !!presence?.is_playing && !!presence?.title;
  const trackId = presence?.track_id ?? presence?.title ?? null;
  const showing = visible && trackId !== dismissedTrackId;

  return (
    <AnimatePresence>
      {showing && (
        <motion.a
          href={presence?.track_url || undefined}
          target="_blank"
          rel="noreferrer noopener"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'group flex items-center gap-2.5 rounded-full bg-card border border-border shadow-lg shadow-black/30 pl-1.5 pr-3 py-1.5 max-w-[280px]',
            'ring-1 ring-[#1DB954]/30 hover:ring-[#1DB954]/60 transition-all',
            floating && 'fixed left-1/2 -translate-x-1/2 bottom-[88px] z-40',
            className,
          )}
          aria-label="Listening on Spotify"
        >
          {presence?.album_art_url ? (
            <img
              src={presence.album_art_url}
              alt=""
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#1DB954]/20 flex items-center justify-center flex-shrink-0">
              <SpotifyMark />
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <Equalizer />
              <span className="text-[10px] font-bold text-[#1DB954] tracking-wide uppercase">
                Listening on Spotify
              </span>
            </div>
            <span className="text-xs text-foreground truncate font-medium">
              {presence?.title}
              {presence?.artist ? <span className="text-muted-foreground"> · {presence.artist}</span> : null}
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDismissedTrackId(trackId);
            }}
            className="ml-1 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95 transition flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-3 h-3" />
          </button>
        </motion.a>
      )}
    </AnimatePresence>
  );
}

function Equalizer() {
  return (
    <span className="inline-flex items-end gap-[1.5px] h-2.5 flex-shrink-0">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-[2px] bg-[#1DB954] rounded-full"
          animate={{ height: ['30%', '100%', '50%', '90%', '30%'] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay: i * 0.15 }}
        />
      ))}
    </span>
  );
}

function SpotifyMark() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#1DB954]" fill="currentColor" aria-hidden="true">
      <path d="M12 0a12 12 0 1 0 12 12A12 12 0 0 0 12 0Zm5.5 17.3a.75.75 0 0 1-1 .25c-2.8-1.7-6.3-2-10.5-1.1a.75.75 0 1 1-.3-1.5c4.5-1 8.4-.6 11.5 1.3a.75.75 0 0 1 .3 1Zm1.5-3.3a.94.94 0 0 1-1.3.3c-3.2-2-8-2.5-11.8-1.4a.94.94 0 1 1-.5-1.8c4.3-1.3 9.6-.7 13.2 1.5a.94.94 0 0 1 .4 1.4Zm.1-3.4c-3.8-2.3-10.2-2.5-13.9-1.4a1.13 1.13 0 1 1-.6-2.2c4.2-1.3 11.3-1 15.7 1.6a1.13 1.13 0 0 1-1.2 2Z" />
    </svg>
  );
}

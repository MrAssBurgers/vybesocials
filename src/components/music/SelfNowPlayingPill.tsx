import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useLiveMusicPresence } from '@/hooks/useLiveMusicPresence';
import { LiveSpotifyWaveform } from '@/components/music/LiveSpotifyWaveform';
import { providerTheme } from '@/components/music/providerTheme';
import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  /** When true, render as a fixed floating pill near the bottom of the screen */
  floating?: boolean;
}

/**
 * Discord-style "Listening to / Watching on …" pill for the signed-in user.
 * Provider-aware (Spotify · Apple Music · YouTube · Twitch · Steam).
 */
export function SelfNowPlayingPill({ className, floating = false }: Props) {
  const { user } = useAuth();
  const presence = useLiveMusicPresence(user?.id);
  const [dismissedTrackId, setDismissedTrackId] = useState<string | null>(null);

  const visible = !!presence?.is_playing && !!presence?.title;
  const trackId = presence?.track_id ?? presence?.title ?? null;
  const showing = visible && trackId !== dismissedTrackId;
  const theme = providerTheme(presence?.provider);

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
            'ring-1 transition-all',
            theme.ring,
            theme.ringHover,
            floating && 'fixed left-1/2 -translate-x-1/2 bottom-[88px] z-40',
            className,
          )}
          aria-label={theme.label}
        >
          {presence?.album_art_url ? (
            <img
              src={presence.album_art_url}
              alt=""
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: `${theme.color}33` }}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: theme.color }} />
            </div>
          )}
          <div className="flex flex-col min-w-0">
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


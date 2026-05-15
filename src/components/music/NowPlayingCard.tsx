import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Music2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { LiveMusicPresence } from '@/hooks/useLiveMusicPresence';
import { cn } from '@/lib/utils';

interface Props {
  presence: LiveMusicPresence | null;
  className?: string;
}

/**
 * Glassmorphism Spotify "now playing" card.
 * Animated equalizer, glowing green dot, progress bar that interpolates locally
 * between server pushes so it feels live without spamming the network.
 */
export function NowPlayingCard({ presence, className }: Props) {
  const [progress, setProgress] = useState(0);

  // Interpolate progress locally
  useEffect(() => {
    if (!presence?.is_playing || !presence.duration_ms) {
      setProgress(presence?.progress_ms ?? 0);
      return;
    }
    const base = presence.progress_ms ?? 0;
    const startedAt = Date.now();
    setProgress(base);
    const id = setInterval(() => {
      const next = base + (Date.now() - startedAt);
      setProgress(Math.min(next, presence.duration_ms!));
    }, 500);
    return () => clearInterval(id);
  }, [presence?.progress_ms, presence?.is_playing, presence?.duration_ms, presence?.track_id]);

  return (
    <AnimatePresence mode="wait">
      {presence?.is_playing && presence.title && (
        <motion.a
          key={presence.track_id || presence.title}
          href={presence.track_url || '#'}
          target="_blank"
          rel="noopener noreferrer"
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'block relative overflow-hidden rounded-2xl liquid-glass-card p-4 group',
            'border border-[#1DB954]/20 hover:border-[#1DB954]/40 transition-colors',
            className,
          )}
        >
          {/* Soft green glow */}
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-[#1DB954]/10 via-transparent to-purple-500/10 pointer-events-none" />
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-[#1DB954]/20 blur-3xl pointer-events-none" />

          <div className="relative flex items-center gap-3">
            {/* Album art */}
            <div className="relative w-16 h-16 flex-shrink-0 rounded-xl overflow-hidden shadow-lg">
              {presence.album_art_url ? (
                <img src={presence.album_art_url} alt={presence.album || ''} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center"><Music2 className="w-6 h-6 text-muted-foreground" /></div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inset-0 rounded-full bg-[#1DB954] animate-ping opacity-75" />
                  <span className="relative rounded-full w-2 h-2 bg-[#1DB954] shadow-[0_0_8px_#1DB954]" />
                </span>
                <span className="text-[10px] uppercase tracking-wider font-bold text-[#1DB954]">Listening on Spotify</span>
                <Equalizer />
              </div>
              <p className="font-bold text-sm text-foreground truncate">{presence.title}</p>
              <p className="text-xs text-muted-foreground truncate">{presence.artist}{presence.album ? ` · ${presence.album}` : ''}</p>
            </div>

            <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
          </div>

          {/* Progress bar */}
          {presence.duration_ms ? (
            <div className="relative mt-3 h-1 rounded-full bg-foreground/10 overflow-hidden">
              <motion.div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-[#1DB954] to-emerald-300 rounded-full"
                style={{ width: `${Math.min(100, (progress / presence.duration_ms) * 100)}%` }}
                transition={{ ease: 'linear', duration: 0.5 }}
              />
            </div>
          ) : null}
        </motion.a>
      )}
    </AnimatePresence>
  );
}

function Equalizer() {
  return (
    <span className="ml-1 inline-flex items-end gap-[2px] h-3">
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

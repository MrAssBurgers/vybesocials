import { motion, AnimatePresence } from 'framer-motion';
import { ExternalLink, Music2, Headphones, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useListenAlong } from '@/hooks/useListenAlong';
import type { LiveMusicPresence } from '@/hooks/useLiveMusicPresence';
import { cn } from '@/lib/utils';

interface Props {
  presence: (LiveMusicPresence & { tempo?: number | null; energy?: number | null }) | null;
  className?: string;
  /** Hide listen-along button (e.g. when viewing own profile). */
  hideListenAlong?: boolean;
}

/**
 * Glassmorphism Spotify "now playing" card.
 * Beat-matched waveform (driven by tempo/energy if available),
 * progress bar interpolated locally, plus Open + Listen-along actions.
 */
export function NowPlayingCard({ presence, className, hideListenAlong }: Props) {
  const { user } = useAuth();
  const [progress, setProgress] = useState(0);
  const { listenAlong, loading: syncing } = useListenAlong();
  const isOwn = !!user && !!presence && user.id === presence.user_id;

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

  const handleListenAlong = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void listenAlong(presence);
  };

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (presence?.track_url) window.open(presence.track_url, '_blank', 'noopener,noreferrer');
  };

  return (
    <AnimatePresence mode="wait">
      {presence?.is_playing && presence.title && (
        <motion.div
          key={presence.track_id || presence.title}
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            'block relative overflow-hidden rounded-2xl liquid-glass-card p-4 group',
            'border border-[#1DB954]/20',
            className,
          )}
        >
          {/* Soft green glow */}
          <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-[#1DB954]/10 via-transparent to-purple-500/10 pointer-events-none" />
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-[#1DB954]/20 blur-3xl pointer-events-none" />

          <div className="relative flex items-center gap-3">
            {/* Album art */}
            <div className="relative w-14 h-14 flex-shrink-0 rounded-xl overflow-hidden shadow-lg">
              {presence.album_art_url ? (
                <img src={presence.album_art_url} alt={presence.album || ''} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-muted flex items-center justify-center"><Music2 className="w-6 h-6 text-muted-foreground" /></div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inset-0 rounded-full bg-[#1DB954] animate-ping opacity-75" />
                  <span className="relative rounded-full w-2 h-2 bg-[#1DB954] shadow-[0_0_8px_#1DB954]" />
                </span>
                <span className="text-[10px] uppercase tracking-wider font-bold text-[#1DB954]">Listening on Spotify</span>
                <BeatWaveform tempo={presence.tempo ?? null} energy={presence.energy ?? null} />
              </div>
              <p className="font-bold text-sm text-foreground truncate">{presence.title}</p>
              <p className="text-xs text-muted-foreground truncate">{presence.artist}{presence.album ? ` · ${presence.album}` : ''}</p>
            </div>
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

          {/* Actions */}
          <div className="relative flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={handleOpen}
              className="flex-1 h-9 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 bg-foreground/5 hover:bg-foreground/10 border border-border/30 text-foreground/90 active:scale-95 transition"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open in Spotify
            </button>
            {!hideListenAlong && !isOwn && presence.provider === 'spotify' && (
              <button
                type="button"
                onClick={handleListenAlong}
                disabled={syncing}
                className="flex-1 h-9 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1.5 bg-[#1DB954] hover:bg-[#1ed760] text-black active:scale-95 transition disabled:opacity-60"
              >
                {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Headphones className="w-3.5 h-3.5" />}
                Listen along
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Beat-matched equalizer. When tempo (BPM) is known we drive a CSS animation
 * at exactly `60_000 / tempo` ms per beat and scale amplitude by energy.
 * Falls back to gentle pulse when audio features are unavailable.
 */
function BeatWaveform({ tempo, energy }: { tempo: number | null; energy: number | null }) {
  const bars = 5;
  const beatMs = tempo && tempo > 0 ? 60_000 / tempo : null;
  const amp = Math.max(0.5, Math.min(1, energy ?? 0.7));
  // We need a per-bar phase so they're staggered.
  const phases = useMemo(() => Array.from({ length: bars }, (_, i) => (i / bars)), []);
  return (
    <span className="ml-1 inline-flex items-end gap-[2px] h-3" aria-hidden>
      {phases.map((p, i) => (
        <span
          key={i}
          className="w-[2px] bg-[#1DB954] rounded-full"
          style={
            beatMs
              ? {
                  height: `${30 + amp * 70}%`,
                  animation: `vybe-beat ${beatMs}ms cubic-bezier(.4,0,.2,1) -${p * beatMs}ms infinite`,
                }
              : {
                  height: '50%',
                  animation: `vybe-beat 900ms ease-in-out -${p * 180}ms infinite`,
                }
          }
        />
      ))}
      <style>{`
        @keyframes vybe-beat {
          0%, 100% { transform: scaleY(0.35); }
          20% { transform: scaleY(1); }
          60% { transform: scaleY(0.55); }
        }
      `}</style>
    </span>
  );
}

import { motion } from 'framer-motion';
import { useLiveMusicPresence } from '@/hooks/useLiveMusicPresence';
import { cn } from '@/lib/utils';

interface Props {
  /** Auth user id (profiles.user_id), NOT profiles.id */
  authUserId: string | null | undefined;
  className?: string;
  /** Compact = single line truncated, used in DM list rows */
  compact?: boolean;
}

/**
 * Tiny inline "Listening on Spotify" badge. Shown in DM rows + chat header.
 * Renders nothing when the user is not playing anything.
 */
export function NowPlayingInline({ authUserId, className, compact = true }: Props) {
  const presence = useLiveMusicPresence(authUserId);
  if (!presence?.is_playing || !presence.title) return null;

  const meta = [presence.title, presence.artist].filter(Boolean).join(' · ');

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 min-w-0',
        compact ? 'text-[11px]' : 'text-xs',
        className,
      )}
      title={meta}
    >
      <Equalizer />
      <span className="text-[#1DB954] font-semibold whitespace-nowrap">Listening</span>
      <span className="text-muted-foreground truncate">· {meta}</span>
    </div>
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

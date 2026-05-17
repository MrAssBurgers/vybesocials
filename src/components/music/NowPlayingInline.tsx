import { useLiveMusicPresence } from '@/hooks/useLiveMusicPresence';
import { useListenAlong } from '@/hooks/useListenAlong';
import { useAuth } from '@/lib/auth';
import { LiveSpotifyWaveform } from '@/components/music/LiveSpotifyWaveform';
import { Headphones } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  /** Auth user id (profiles.user_id), NOT profiles.id */
  authUserId: string | null | undefined;
  className?: string;
  /** Compact = single line truncated, used in DM list rows */
  compact?: boolean;
  /** Show a headphones "listen along" affordance when not self */
  enableListenAlong?: boolean;
}

/**
 * Tiny inline "Listening on Spotify" badge. Shown in DM rows + chat header.
 * Renders nothing when the user is not playing anything. When viewing
 * someone else, tap to listen along on your own Spotify.
 */
export function NowPlayingInline({ authUserId, className, compact = true, enableListenAlong = true }: Props) {
  const presence = useLiveMusicPresence(authUserId);
  const { user } = useAuth();
  const { listenAlong, loading } = useListenAlong();

  if (!presence?.is_playing || !presence.title) return null;

  const meta = [presence.title, presence.artist].filter(Boolean).join(' · ');
  const isOther = !!user?.id && !!authUserId && user.id !== authUserId;
  const interactive = isOther && enableListenAlong;

  const inner = (
    <>
      <LiveSpotifyWaveform tempo={presence.tempo} energy={presence.energy} isPlaying={presence.is_playing} height={10} bars={3} />
      <span className="text-[#1DB954] font-semibold whitespace-nowrap">Listening</span>
      <span className="text-muted-foreground truncate">· {meta}</span>
      {interactive && (
        <Headphones className="w-3 h-3 text-[#1DB954] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      )}
    </>
  );

  const baseClass = cn(
    'inline-flex items-center gap-1.5 min-w-0 group',
    compact ? 'text-[11px]' : 'text-xs',
    interactive && 'cursor-pointer hover:text-foreground active:scale-[0.98] transition',
    className,
  );

  if (interactive) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!loading) listenAlong(presence);
        }}
        title={`Listen along · ${meta}`}
        className={baseClass}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className={baseClass} title={meta}>
      {inner}
    </div>
  );
}

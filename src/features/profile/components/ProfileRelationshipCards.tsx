import { Heart, Sparkles } from 'lucide-react';
import { useFriendshipPair } from '@/hooks/useFriendshipPair';
import { useRelationshipState } from '@/hooks/useRelationshipState';
import { cn } from '@/lib/utils';
import type { ProfileRelationshipSummary } from '../types';

interface ProfileRelationshipCardsProps {
  otherProfileId: string;
  summary?: ProfileRelationshipSummary | null;
  onOpenFriendship?: () => void;
  className?: string;
}

function vibePercentFromLevel(level?: number | null, streakDays?: number): number | null {
  if (level == null && !streakDays) return null;
  const fromLevel = Math.min(95, Math.max(40, (Number(level) || 1) * 12 + 28));
  const streakBoost = Math.min(12, Math.floor((streakDays || 0) / 3));
  return Math.min(99, fromLevel + streakBoost);
}

export function ProfileRelationshipCards({
  otherProfileId,
  summary,
  onOpenFriendship,
  className,
}: ProfileRelationshipCardsProps) {
  const { data: pair } = useFriendshipPair(otherProfileId);
  const { data: relState } = useRelationshipState(otherProfileId, true);

  const isBestFriend =
    summary?.isBestFriend ||
    relState?.best_friend_rank != null ||
    relState?.primary_relationship_state === 'best_friend' ||
    relState?.primary_relationship_state === 'mutual_best_friend';

  const rank = relState?.best_friend_rank;
  const vibe = vibePercentFromLevel(
    pair?.friendship_level,
    summary?.streakDays ?? pair?.current_streak,
  );

  const bfProgress = rank != null ? Math.max(18, 100 - Math.min(rank, 20) * 4) : isBestFriend ? 72 : 45;

  return (
    <div className={cn('vybe-profile-chrome grid grid-cols-2 gap-2.5 px-4', className)}>
      <button type="button" onClick={onOpenFriendship} className="vybe-profile-rel-card">
        <div className="relative z-[1]">
          <span className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-primary shadow-[0_0_20px_hsl(var(--primary)/0.4)]">
            <Heart className="h-4 w-4 fill-current" />
          </span>
          <p className="text-sm font-bold">Best Friend</p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {rank != null
              ? `#${rank} · private to you`
              : isBestFriend
                ? 'Private status'
                : 'Tap for details'}
          </p>
          <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted/40">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
              style={{ width: `${bfProgress}%` }}
            />
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={onOpenFriendship}
        className="vybe-profile-rel-card vybe-profile-rel-card--compat"
      >
        <div className="relative z-[1]">
          <span className="mb-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent/25 text-primary shadow-[0_0_20px_hsl(var(--accent)/0.35)]">
            <Sparkles className="h-4 w-4" />
          </span>
          <p className="text-sm font-bold">VYBE Compatibility</p>
          {vibe != null ? (
            <>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                <span className="text-base font-bold text-foreground">{vibe}%</span>
                {' · '}
                {vibe >= 85 ? 'Perfect vibe' : vibe >= 65 ? 'Strong vibe' : 'Growing'}
              </p>
              <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-muted/40">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-primary"
                  style={{ width: `${vibe}%` }}
                />
              </div>
            </>
          ) : (
            <p className="mt-0.5 text-[11px] text-muted-foreground">Keep chatting to unlock</p>
          )}
        </div>
      </button>
    </div>
  );
}

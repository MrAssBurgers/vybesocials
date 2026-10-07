import { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { useVybeScore, useVybeScoreBreakdown, useVybeScorePrivacy, updateVybeScorePrivacy, formatVybeScore } from '@/hooks/useVybeScore';
import { useFriendshipStatus } from '@/hooks/useFriends';
import { canShowVybeScore } from '@/lib/relationship/vybeScorePure';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface VybeScoreProps {
  profileId: string;
  isOwnProfile?: boolean;
  className?: string;
}

const ACTION_LABEL: Record<string, string> = {
  dm_send: 'Messages sent',
  dm_receive: 'Messages received',
  post_video: 'Clips posted',
  post_create: 'Posts created',
  story_create: 'Stories shared',
  story_view_received: 'Story views',
  reaction_received: 'Reactions received',
  reaction_given: 'Reactions given',
  comment_post: 'Comments posted',
  comment_received: 'Comments received',
  share_sent: 'Shares sent',
  share_received: 'Shares received',
  save_received: 'Saves received',
  follower_gained: 'New followers',
  daily_login: 'Daily login',
  login_streak_bonus: 'Streak bonus',
  friend_added: 'Friends added',
  challenge_complete: 'Challenges',
  first_post_of_day: 'First post bonus',
};

export function VybeScore({ profileId, isOwnProfile, className }: VybeScoreProps) {
  const { data: score = 0, isLoading } = useVybeScore(profileId);
  const privacy = useVybeScorePrivacy(isOwnProfile ? undefined : profileId);
  const friendship = useFriendshipStatus(isOwnProfile ? undefined : profileId);
  const [open, setOpen] = useState(false);
  const visible = canShowVybeScore({
    own: !!isOwnProfile,
    privacy: privacy.data,
    friend: friendship.data?.status === 'friends',
  });

  if (!isOwnProfile && privacy.isSuccess && !visible) return null;

  if ((isLoading && score === 0) || (!isOwnProfile && privacy.isLoading)) {
    return (
      <div className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-foreground/5', className)}>
        <Zap className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">—</span>
      </div>
    );
  }

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.94 }}
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full',
          'bg-gradient-to-r from-primary/15 to-accent/15 border border-primary/25',
          'text-xs font-bold text-foreground/90 hover:from-primary/25 hover:to-accent/25 transition-colors',
          className,
        )}
        aria-label={`Vybe Score ${score}`}
      >
        <Zap className="h-3 w-3 text-primary fill-primary/40" />
        <AnimatedNumber value={score} format={formatVybeScore} className="tabular-nums" />
      </motion.button>

      <VybeScoreSheet
        open={open}
        onOpenChange={setOpen}
        profileId={profileId}
        score={score}
        isOwnProfile={!!isOwnProfile}
      />
    </>
  );
}

function VybeScoreSheet({
  open, onOpenChange, profileId, score, isOwnProfile,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  profileId: string;
  score: number;
  isOwnProfile: boolean;
}) {
  const { data: breakdown } = useVybeScoreBreakdown(isOwnProfile ? profileId : undefined);
  const { data: privacy = 'public', refetch: refetchPrivacy } = useVybeScorePrivacy(
    isOwnProfile ? profileId : undefined,
  );

  const categoryLabels: Record<string, string> = {
    social: 'Social',
    creator: 'Creator',
    connection: 'Connection',
    streak: 'Streaks',
    challenge: 'Challenges',
    community: 'Community',
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl border-t border-border/40 bg-card/95 backdrop-blur-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary fill-primary/40" />
            Vybe Score
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex flex-col items-center gap-1 py-6">
          <div className="text-5xl font-black tabular-nums bg-gradient-to-br from-primary to-accent bg-clip-text text-transparent">
            <AnimatedNumber value={score} />
          </div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Lifetime score</p>
        </div>

        {isOwnProfile && breakdown && (
          <div className="mt-2 space-y-3 pb-6">
            <div className="rounded-2xl border border-border/40 bg-background/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                Categories
              </p>
              <ul className="space-y-1">
                {Object.entries(breakdown.categories).map(([key, value]) => (
                  <li key={key} className="flex items-center justify-between px-1 py-1">
                    <span className="text-sm">{categoryLabels[key] || key}</span>
                    <span className="text-sm font-semibold tabular-nums">{formatVybeScore(value)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border/40 bg-background/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                Privacy
              </p>
              <Select
                value={privacy}
                onValueChange={async (value) => {
                  await updateVybeScorePrivacy(value as 'public' | 'friends_only' | 'private');
                  await refetchPrivacy();
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="friends_only">Friends only</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-border/40 bg-background/40 px-4 py-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-medium">Earned today</span>
              </div>
              <span className="text-base font-bold text-emerald-400">+{breakdown.today}</span>
            </div>

            {breakdown.topActions.length > 0 && (
              <div className="rounded-2xl border border-border/40 bg-background/40 p-2">
                <p className="px-2 pt-1 pb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Today's top actions
                </p>
                <ul className="space-y-1">
                  {breakdown.topActions.map(({ action, points }) => (
                    <li key={action} className="flex items-center justify-between px-2 py-1.5 rounded-xl hover:bg-foreground/5">
                      <span className="text-sm text-foreground/90">{ACTION_LABEL[action] ?? action}</span>
                      <span className="text-sm font-semibold text-primary">+{points}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground text-center px-4">
              Your score grows when you post, message, react, share, and gain followers. It never goes down.
            </p>
          </div>
        )}

        {!isOwnProfile && (
          <p className="text-[11px] text-muted-foreground text-center px-4 pb-6 pt-2">
            Vybe Score reflects activity on VYBE — posting, messaging, sharing, and engaging.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}

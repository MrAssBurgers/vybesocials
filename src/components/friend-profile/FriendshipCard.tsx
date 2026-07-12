import { memo } from 'react';
import { motion } from 'framer-motion';
import { Users, MessageCircle, Phone, Flame, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useFriendshipPair } from '@/hooks/useFriendshipPair';
import { useStreakWithUser } from '@/hooks/useStreaks';

interface FriendshipCardProps {
  otherProfileId: string;
  className?: string;
}

function formatSince(iso?: string): string {
  if (!iso) return 'Recently';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Recently';
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

export const FriendshipCard = memo(function FriendshipCard({
  otherProfileId,
  className,
}: FriendshipCardProps) {
  const { data: pair, isLoading } = useFriendshipPair(otherProfileId);
  const streak = useStreakWithUser(otherProfileId);

  if (isLoading) {
    return <Skeleton className={cn('h-28 w-full rounded-2xl', className)} />;
  }

  const stats = [
    { icon: MessageCircle, label: 'Messages', value: pair?.message_count ?? 0 },
    { icon: Phone, label: 'Calls', value: pair?.call_count ?? 0 },
    { icon: Flame, label: 'Streak', value: streak?.streak_count ?? pair?.current_streak ?? 0 },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-2xl border border-white/10 bg-card/40 backdrop-blur-xl p-4 shadow-lg',
        className,
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Friendship</h3>
        <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">
          Lvl {pair?.friendship_level ?? 1}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-4">
        <Calendar className="h-3 w-3" />
        <span>Friends since {formatSince(pair?.friends_since)}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {stats.map(({ icon: Icon, label, value }) => (
          <div
            key={label}
            className="rounded-xl bg-white/5 border border-white/5 px-2 py-2.5 text-center"
          >
            <Icon className="h-3.5 w-3.5 mx-auto mb-1 text-muted-foreground" />
            <p className="text-base font-bold tabular-nums">{value}</p>
            <p className="text-[10px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
    </motion.div>
  );
});

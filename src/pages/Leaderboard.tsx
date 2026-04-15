import { useState, memo } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Trophy, Crown, Medal, Star, Users, Flame } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useXpLeaderboard, useFriendsXpLeaderboard, type LeaderboardEntry } from '@/hooks/useXpLeaderboard';

/* ── Podium Card (Top 3) ── */
function PodiumCard({ entry, rank }: { entry: LeaderboardEntry; rank: 1 | 2 | 3 }) {
  const colors = {
    1: { ring: 'ring-yellow-400/60', glow: 'shadow-[0_0_24px_rgba(250,204,21,0.25)]', gradient: 'from-yellow-400/20 to-yellow-600/10', text: 'text-yellow-400', label: 'bg-yellow-400 text-yellow-950' },
    2: { ring: 'ring-gray-300/50', glow: 'shadow-[0_0_16px_rgba(156,163,175,0.2)]', gradient: 'from-gray-300/15 to-gray-500/10', text: 'text-gray-300', label: 'bg-gray-300 text-gray-900' },
    3: { ring: 'ring-amber-500/50', glow: 'shadow-[0_0_16px_rgba(245,158,11,0.2)]', gradient: 'from-amber-500/15 to-amber-700/10', text: 'text-amber-500', label: 'bg-amber-500 text-amber-950' },
  }[rank];

  const height = rank === 1 ? 'pb-6' : rank === 2 ? 'pb-4' : 'pb-2';
  const avatarSize = rank === 1 ? 'h-16 w-16' : 'h-12 w-12';
  const order = rank === 1 ? 'order-2' : rank === 2 ? 'order-1' : 'order-3';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: rank * 0.1, type: 'spring', stiffness: 300, damping: 20 }}
      className={cn('flex-1 flex flex-col items-center', order, height)}
    >
      <Link to={`/u/${entry.username}`} className="flex flex-col items-center gap-2 group">
        {/* Rank badge */}
        <div className={cn('text-xs font-black px-2.5 py-0.5 rounded-full', colors.label)}>
          #{rank}
        </div>

        {/* Avatar with glow ring */}
        <div className="relative">
          <div className={cn('absolute -inset-1 rounded-full opacity-60 animate-pulse', colors.glow)} />
          <Avatar className={cn(avatarSize, 'ring-2', colors.ring, 'relative z-10 group-hover:scale-105 transition-transform')}>
            <AvatarImage src={entry.avatar_url || undefined} />
            <AvatarFallback className="text-sm font-bold">{entry.username?.[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          {rank === 1 && (
            <motion.div
              animate={{ rotate: [0, 8, -8, 0] }}
              transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
              className="absolute -top-3 -right-1 z-20"
            >
              <Crown className="h-5 w-5 text-yellow-400 drop-shadow-lg" />
            </motion.div>
          )}
        </div>

        {/* Info */}
        <div className="text-center">
          <p className={cn('font-bold text-sm truncate max-w-[90px]', rank === 1 && colors.text)}>
            {entry.display_name || entry.username}
          </p>
          <p className="text-[10px] text-muted-foreground">Lvl {entry.current_level}</p>
        </div>

        {/* XP pill */}
        <div className={cn('px-3 py-1 rounded-full bg-gradient-to-r text-xs font-bold', colors.gradient, colors.text)}>
          {entry.total_xp.toLocaleString()} XP
        </div>
      </Link>
    </motion.div>
  );
}

/* ── Rank Row (4+) ── */
const LeaderboardRow = memo(function LeaderboardRow({
  entry, isCurrentUser
}: {
  entry: LeaderboardEntry; isCurrentUser: boolean;
}) {
  const tierAccent = entry.rank <= 10
    ? 'border-l-primary/40'
    : entry.rank <= 25
      ? 'border-l-accent/30'
      : 'border-l-transparent';

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(entry.rank * 0.02, 0.4) }}
    >
      <Link
        to={`/u/${entry.username}`}
        className={cn(
          'flex items-center gap-3 p-3 rounded-xl transition-all hover:bg-accent/30 border-l-2',
          tierAccent,
          isCurrentUser && 'bg-primary/8 ring-1 ring-primary/20'
        )}
      >
        <div className="w-7 text-center shrink-0">
          <span className="text-xs font-bold text-muted-foreground">{entry.rank}</span>
        </div>
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={entry.avatar_url || undefined} />
          <AvatarFallback className="text-xs font-bold">{entry.username?.[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm truncate">{entry.display_name || entry.username}</span>
            {entry.is_verified && <Star className="h-3 w-3 text-primary fill-primary shrink-0" />}
            {isCurrentUser && <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">You</Badge>}
          </div>
          <p className="text-[11px] text-muted-foreground">Level {entry.current_level}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-sm">{entry.total_xp.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">XP</p>
        </div>
      </Link>
    </motion.div>
  );
});

/* ── List (includes podium + rows) ── */
function LeaderboardList({ entries, userEntry }: { entries: LeaderboardEntry[]; userEntry?: LeaderboardEntry | null }) {
  const { user } = useAuth();
  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="space-y-4">
      {/* Podium */}
      {top3.length >= 3 && (
        <div className="flex items-end justify-center gap-2 pt-2 pb-4">
          {top3.map((e, i) => (
            <PodiumCard key={e.user_id} entry={e} rank={(i + 1) as 1 | 2 | 3} />
          ))}
        </div>
      )}

      {/* Separator */}
      {top3.length >= 3 && rest.length > 0 && (
        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      )}

      {/* Remaining rows */}
      <div className="space-y-0.5">
        {rest.map(entry => (
          <LeaderboardRow key={entry.user_id} entry={entry} isCurrentUser={entry.user_id === user?.id} />
        ))}
      </div>

      {/* Current user if not in top */}
      {userEntry && (
        <>
          <div className="flex items-center gap-2 py-2 px-3">
            <div className="flex-1 border-t border-border/50" />
            <span className="text-xs text-muted-foreground">Your Rank</span>
            <div className="flex-1 border-t border-border/50" />
          </div>
          <LeaderboardRow entry={userEntry} isCurrentUser />
        </>
      )}
    </div>
  );
}

export default function LeaderboardPage() {
  const [tab, setTab] = useState<'global' | 'friends'>('global');
  const { data: globalData, isLoading: globalLoading } = useXpLeaderboard(50);
  const { data: friendsData, isLoading: friendsLoading } = useFriendsXpLeaderboard();
  const isLoading = tab === 'global' ? globalLoading : friendsLoading;

  const tabs = [
    { id: 'global' as const, label: 'Global', icon: Flame },
    { id: 'friends' as const, label: 'Friends', icon: Users },
  ];

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="text-center space-y-2">
          <motion.div
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 12 }}
          >
            <div className="relative inline-block">
              <div className="absolute -inset-3 rounded-full bg-yellow-400/10 animate-pulse" />
              <Trophy className="h-10 w-10 text-yellow-400 relative z-10" />
            </div>
          </motion.div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-yellow-400 via-primary to-purple-400 bg-clip-text text-transparent">
            Leaderboard
          </h1>
          <p className="text-sm text-muted-foreground">Top players ranked by experience</p>
        </div>

        {/* Capsule Tabs */}
        <LayoutGroup>
          <div className="flex items-center justify-center gap-1 p-1 rounded-2xl bg-card/60 backdrop-blur-md border border-border/30 mx-auto w-fit">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-medium transition-colors z-10',
                  tab === t.id ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {tab === t.id && (
                  <motion.div
                    layoutId="leaderboard-tab-bg"
                    className="absolute inset-0 rounded-xl bg-primary shadow-md shadow-primary/20"
                    transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                  />
                )}
                <t.icon className="h-4 w-4 relative z-10" />
                <span className="relative z-10">{t.label}</span>
              </button>
            ))}
          </div>
        </LayoutGroup>

        {/* Content */}
        <div className="liquid-glass-card p-3">
          {isLoading ? (
            <div className="space-y-3 p-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-7 h-4" />
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16 mt-1" />
                  </div>
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                {tab === 'global' && globalData && (
                  <LeaderboardList entries={globalData.entries} userEntry={globalData.userEntry} />
                )}
                {tab === 'friends' && (
                  friendsData && friendsData.length > 0 ? (
                    <LeaderboardList entries={friendsData} />
                  ) : (
                    <div className="text-center py-12 space-y-3">
                      <div className="relative inline-block">
                        <div className="absolute -inset-4 rounded-full bg-primary/5 animate-pulse" />
                        <Users className="h-10 w-10 text-muted-foreground/50 relative z-10" />
                      </div>
                      <p className="text-muted-foreground text-sm">Add friends to see their rankings!</p>
                    </div>
                  )
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

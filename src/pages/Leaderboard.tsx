import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Trophy, Crown, Medal, Star, Users, Flame } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { useXpLeaderboard, useFriendsXpLeaderboard, type LeaderboardEntry } from '@/hooks/useXpLeaderboard';

function getRankIcon(rank: number) {
  if (rank === 1) return <Crown className="h-5 w-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />;
  return <span className="text-sm font-bold text-muted-foreground w-5 text-center">{rank}</span>;
}

function getRankGlow(rank: number) {
  if (rank === 1) return 'ring-2 ring-yellow-400/50 shadow-[0_0_16px_rgba(250,204,21,0.3)]';
  if (rank === 2) return 'ring-2 ring-gray-300/40';
  if (rank === 3) return 'ring-2 ring-amber-500/40';
  return '';
}

const LeaderboardRow = memo(function LeaderboardRow({ 
  entry, isCurrentUser 
}: { 
  entry: LeaderboardEntry; isCurrentUser: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(entry.rank * 0.03, 0.5) }}
    >
      <Link 
        to={`/u/${entry.username}`}
        className={cn(
          'flex items-center gap-3 p-3 rounded-xl transition-all hover:bg-accent/50',
          isCurrentUser && 'bg-primary/10 border border-primary/20',
          entry.rank <= 3 && 'py-4'
        )}
      >
        {/* Rank */}
        <div className="w-8 flex items-center justify-center shrink-0">
          {getRankIcon(entry.rank)}
        </div>

        {/* Avatar */}
        <Avatar className={cn('h-10 w-10 shrink-0', getRankGlow(entry.rank))}>
          <AvatarImage src={entry.avatar_url || undefined} />
          <AvatarFallback className="text-sm font-bold">
            {entry.username?.[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={cn(
              'font-semibold text-sm truncate',
              entry.rank === 1 && 'text-yellow-400'
            )}>
              {entry.display_name || entry.username}
            </span>
            {entry.is_verified && (
              <Star className="h-3.5 w-3.5 text-primary fill-primary shrink-0" />
            )}
            {isCurrentUser && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">You</Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Level {entry.current_level}</p>
        </div>

        {/* XP */}
        <div className="text-right shrink-0">
          <p className={cn(
            'font-bold text-sm',
            entry.rank === 1 && 'text-yellow-400'
          )}>
            {entry.total_xp.toLocaleString()}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">XP</p>
        </div>
      </Link>
    </motion.div>
  );
});

function LeaderboardList({ entries, userEntry }: { entries: LeaderboardEntry[]; userEntry?: LeaderboardEntry | null }) {
  const { user } = useAuth();

  return (
    <div className="space-y-1">
      {entries.map(entry => (
        <LeaderboardRow 
          key={entry.user_id} 
          entry={entry} 
          isCurrentUser={entry.user_id === user?.id} 
        />
      ))}
      
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

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="text-center space-y-2">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
          >
            <Trophy className="h-10 w-10 text-yellow-400 mx-auto" />
          </motion.div>
          <h1 className="text-2xl font-bold text-foreground">XP Leaderboard</h1>
          <p className="text-sm text-muted-foreground">Top players ranked by experience</p>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="global" className="gap-1.5">
              <Flame className="h-4 w-4" /> Global
            </TabsTrigger>
            <TabsTrigger value="friends" className="gap-1.5">
              <Users className="h-4 w-4" /> Friends
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Content */}
        <div className="liquid-glass-card p-2">
          {isLoading ? (
            <div className="space-y-3 p-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="w-8 h-5" />
                  <Skeleton className="h-10 w-10 rounded-full" />
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
                  <LeaderboardList 
                    entries={globalData.entries} 
                    userEntry={globalData.userEntry} 
                  />
                )}
                {tab === 'friends' && (
                  friendsData && friendsData.length > 0 ? (
                    <LeaderboardList entries={friendsData} />
                  ) : (
                    <div className="text-center py-12 space-y-2">
                      <Users className="h-10 w-10 text-muted-foreground/50 mx-auto" />
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

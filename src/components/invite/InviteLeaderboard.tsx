import { motion } from 'framer-motion';
import { Trophy, Medal, Award, Crown } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useInviteLeaderboard } from '@/hooks/useInviteLeaderboard';
import { useAuthOptional } from '@/lib/auth';
import { cn } from '@/lib/utils';

const rankIcons = [
  { icon: Crown, color: 'text-yellow-400', bg: 'bg-yellow-400/20' },
  { icon: Medal, color: 'text-slate-300', bg: 'bg-slate-300/20' },
  { icon: Award, color: 'text-amber-600', bg: 'bg-amber-600/20' },
];

function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const config = rankIcons[rank - 1];
    const Icon = config.icon;
    return (
      <div className={cn("w-8 h-8 rounded-full flex items-center justify-center", config.bg)}>
        <Icon className={cn("h-4 w-4", config.color)} />
      </div>
    );
  }
  
  return (
    <div className="w-8 h-8 rounded-full bg-muted/50 flex items-center justify-center text-sm font-medium text-muted-foreground">
      {rank}
    </div>
  );
}

export function InviteLeaderboard() {
  const auth = useAuthOptional();
  const profile = auth?.profile ?? null;
  const { data, isLoading, error } = useInviteLeaderboard(10);
  
  if (error) {
    return null; // Silently fail - leaderboard is not critical
  }
  
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="liquid-glass-card rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Top Inviters on VYBE</h2>
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </motion.div>
    );
  }
  
  const { entries, currentUserEntry, currentUserInTop } = data || { 
    entries: [], 
    currentUserEntry: null, 
    currentUserInTop: false 
  };
  
  if (entries.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="liquid-glass-card rounded-2xl p-6 space-y-4"
      >
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Top Inviters on VYBE</h2>
        </div>
        <div className="text-center py-6">
          <Trophy className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">No rankings yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Be the first to invite friends!
          </p>
        </div>
      </motion.div>
    );
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="liquid-glass-card rounded-2xl p-6 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Top Inviters on VYBE</h2>
        </div>
        <Badge variant="outline" className="text-xs">
          Top {Math.min(10, entries.length)}
        </Badge>
      </div>
      
      <div className="space-y-2">
        {entries.map((entry, index) => {
          const isCurrentUser = profile?.id === entry.profile_id;
          
          return (
            <motion.div
              key={entry.profile_id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={cn(
                "flex items-center gap-3 p-2 rounded-xl transition-colors",
                isCurrentUser 
                  ? "bg-primary/10 border border-primary/30" 
                  : "hover:bg-muted/30"
              )}
            >
              <RankBadge rank={entry.rank} />
              
              <Avatar className="h-9 w-9">
                <AvatarImage src={entry.avatar_url || undefined} />
                <AvatarFallback>
                  {entry.username?.[0]?.toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <p className={cn(
                  "font-medium truncate text-sm",
                  isCurrentUser && "text-primary"
                )}>
                  @{entry.username}
                  {isCurrentUser && (
                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                  )}
                </p>
                {entry.display_name && entry.display_name !== entry.username && (
                  <p className="text-xs text-muted-foreground truncate">
                    {entry.display_name}
                  </p>
                )}
              </div>
              
              <div className="text-right">
                <p className="font-semibold text-sm">{entry.invite_count}</p>
                <p className="text-[10px] text-muted-foreground">invites</p>
              </div>
            </motion.div>
          );
        })}
      </div>
      
      {/* Show current user if outside top 10 */}
      {!currentUserInTop && currentUserEntry && (
        <>
          <div className="border-t border-border/50 pt-3 mt-3">
            <p className="text-xs text-muted-foreground text-center mb-2">Your ranking</p>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 p-2 rounded-xl bg-primary/10 border border-primary/30"
            >
              <RankBadge rank={currentUserEntry.rank} />
              
              <Avatar className="h-9 w-9">
                <AvatarImage src={currentUserEntry.avatar_url || undefined} />
                <AvatarFallback>
                  {currentUserEntry.username?.[0]?.toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate text-sm text-primary">
                  @{currentUserEntry.username}
                  <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                </p>
              </div>
              
              <div className="text-right">
                <p className="font-semibold text-sm">{currentUserEntry.invite_count}</p>
                <p className="text-[10px] text-muted-foreground">invites</p>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </motion.div>
  );
}

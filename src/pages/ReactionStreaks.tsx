import { AppLayout } from '@/components/layout/AppLayout';
import { useReactionStreaks } from '@/hooks/useReactionStreaks';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Trophy, ArrowLeft, Sparkles, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

function getStreakEmoji(count: number) {
  if (count >= 100) return '💎';
  if (count >= 50) return '👑';
  if (count >= 30) return '⚡';
  if (count >= 14) return '💜';
  if (count >= 7) return '🔥';
  if (count >= 3) return '✨';
  return '🌱';
}

function getStreakTier(count: number) {
  if (count >= 100) return { label: 'LEGENDARY', color: 'text-cyan-400', bg: 'from-cyan-500/20 to-purple-500/20' };
  if (count >= 50) return { label: 'MYTHIC', color: 'text-yellow-400', bg: 'from-yellow-500/20 to-orange-500/20' };
  if (count >= 30) return { label: 'EPIC', color: 'text-purple-400', bg: 'from-purple-500/20 to-pink-500/20' };
  if (count >= 14) return { label: 'RARE', color: 'text-blue-400', bg: 'from-blue-500/20 to-indigo-500/20' };
  if (count >= 7) return { label: 'HOT', color: 'text-orange-400', bg: 'from-orange-500/20 to-red-500/20' };
  if (count >= 3) return { label: 'WARMING UP', color: 'text-amber-400', bg: 'from-amber-500/20 to-yellow-500/20' };
  return { label: 'STARTING', color: 'text-muted-foreground', bg: 'from-muted/20 to-muted/10' };
}

export default function ReactionStreaks() {
  const navigate = useNavigate();
  const { data: streaks = [], isLoading } = useReactionStreaks();

  return (
    <AppLayout>
      <div className="max-w-lg mx-auto px-4 py-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Flame className="h-6 w-6 text-orange-500" />
              Reaction Streaks
            </h1>
            <p className="text-sm text-muted-foreground">
              Keep vibing with friends daily to build legendary streaks
            </p>
          </div>
        </div>

        {/* Stats overview */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <motion.div 
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="rounded-2xl p-3 text-center bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/20"
          >
            <Flame className="h-5 w-5 text-orange-500 mx-auto mb-1" />
            <p className="text-xl font-bold">{streaks.length}</p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Active</p>
          </motion.div>
          <motion.div 
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.05 }}
            className="rounded-2xl p-3 text-center bg-gradient-to-br from-purple-500/20 to-pink-500/20 border border-purple-500/20"
          >
            <Trophy className="h-5 w-5 text-purple-400 mx-auto mb-1" />
            <p className="text-xl font-bold">
              {streaks.length > 0 ? Math.max(...streaks.map(s => s.current_streak)) : 0}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Highest</p>
          </motion.div>
          <motion.div 
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl p-3 text-center bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/20"
          >
            <Sparkles className="h-5 w-5 text-cyan-400 mx-auto mb-1" />
            <p className="text-xl font-bold">
              {streaks.length > 0 ? Math.max(...streaks.map(s => s.longest_streak)) : 0}
            </p>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">All-Time</p>
          </motion.div>
        </div>

        {/* How it works */}
        <div className="rounded-2xl p-4 mb-6 border border-border/50 bg-card/50">
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <Zap className="h-4 w-4 text-primary" />
            How Streaks Work
          </h3>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>🔥 Both you and a friend must interact (like, comment, message) within 48h</li>
            <li>⚡ Each mutual interaction day increases the streak by 1</li>
            <li>💀 Miss a 48h window and the streak resets to zero</li>
            <li>🏆 Hit milestones to unlock exclusive streak badges!</li>
          </ul>
        </div>

        {/* Streak list */}
        <div className="space-y-2">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-muted/30 animate-pulse" />
            ))
          ) : streaks.length === 0 ? (
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center py-12"
            >
              <Flame className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No active streaks yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Start interacting with friends to build your first streak!
              </p>
              <Button onClick={() => navigate('/home')} className="rounded-full">
                Go Vibe
              </Button>
            </motion.div>
          ) : (
            <AnimatePresence>
              {streaks.map((streak, i) => {
                const tier = getStreakTier(streak.current_streak);
                const emoji = getStreakEmoji(streak.current_streak);
                return (
                  <motion.div
                    key={streak.id}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className={cn(
                      "relative rounded-2xl p-4 border border-border/50 overflow-hidden cursor-pointer",
                      "bg-gradient-to-r", tier.bg
                    )}
                    onClick={() => streak.partner && navigate(`/u/${streak.partner.username}`)}
                  >
                    <div className="flex items-center gap-3 relative z-10">
                      <Avatar className="h-12 w-12 ring-2 ring-primary/30">
                        <AvatarImage src={streak.partner?.avatar_url || undefined} />
                        <AvatarFallback>{streak.partner?.username?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold truncate">
                            {streak.partner?.display_name || streak.partner?.username}
                          </p>
                          <span className={cn("text-[10px] font-bold uppercase tracking-wider", tier.color)}>
                            {tier.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Best: {streak.longest_streak} days
                        </p>
                      </div>

                      <div className="text-center">
                        <motion.div
                          className="text-2xl"
                          animate={{ scale: [1, 1.2, 1] }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          {emoji}
                        </motion.div>
                        <p className="text-lg font-bold">{streak.current_streak}</p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

import { motion } from 'framer-motion';
import { Flame, Zap, ChevronRight } from 'lucide-react';
import { useStreakCount } from '@/hooks/useLoginStreak';
import { useNextLevelProgress, useUserLevel } from '@/hooks/useVybePass';
import { useNavigate } from 'react-router-dom';

export function XPStreakWidget() {
  const streakCount = useStreakCount();
  const { data: userLevel, isLoading: levelLoading } = useUserLevel();
  const { currentLevel, progressPercent, xpToNextLevel, isReady: levelReady } = useNextLevelProgress();
  const navigate = useNavigate();

  if ((levelLoading && !userLevel) || !levelReady || currentLevel == null) {
    return null;
  }

  return (
    <div className="px-4 pb-2">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
      >
        <div
          className="p-2.5 cursor-pointer rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm"
          onClick={() => navigate('/challenges')}
        >
          <div className="flex items-center gap-3">
            {streakCount > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent/10 border border-accent/20">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 0.4, ease: 'easeInOut' }}
                >
                  <Flame className="h-3.5 w-3.5 text-accent drop-shadow-[0_0_4px_hsl(var(--accent)/0.6)]" />
                </motion.div>
                <span className="text-xs font-bold text-accent">{streakCount}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-semibold">Lv.{currentLevel}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">{xpToNextLevel} XP to next</span>
              </div>
              {/* Shimmer progress bar */}
              <div className="relative h-1.5 w-full rounded-full bg-secondary overflow-hidden">
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary via-accent to-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
                {/* Moving shimmer highlight */}
                <motion.div
                  className="absolute inset-y-0 w-8 rounded-full bg-gradient-to-r from-transparent via-white/30 to-transparent"
                  animate={{ left: ['-2rem', '100%'] }}
                  transition={{ duration: 2, repeat: Infinity, repeatDelay: 1, ease: 'easeInOut' }}
                />
              </div>
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

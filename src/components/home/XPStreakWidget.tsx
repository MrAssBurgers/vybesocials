import { motion } from 'framer-motion';
import { Flame, Zap, ChevronRight } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useStreakCount } from '@/hooks/useLoginStreak';
import { useNextLevelProgress } from '@/hooks/useVybePass';
import { useNavigate } from 'react-router-dom';

export function XPStreakWidget() {
  const streakCount = useStreakCount();
  const { currentLevel, progressPercent, xpToNextLevel } = useNextLevelProgress();
  const navigate = useNavigate();

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
                <Flame className="h-3.5 w-3.5 text-accent" />
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
              <Progress value={progressPercent} className="h-1.5" />
            </div>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}

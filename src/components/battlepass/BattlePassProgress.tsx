import { motion } from 'framer-motion';
import { Star, Zap, Trophy, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { GlassCard } from '@/components/ui/glass/GlassCard';
import { Progress } from '@/components/ui/progress';
import { useNextLevelProgress, useBattlePassTiers } from '@/hooks/useBattlePass';
import { cn } from '@/lib/utils';

interface BattlePassProgressProps {
  compact?: boolean;
  showTiers?: boolean;
}

export function BattlePassProgress({ compact = false, showTiers = false }: BattlePassProgressProps) {
  const navigate = useNavigate();
  const { currentXP, currentLevel, progressPercent, xpToNextLevel } = useNextLevelProgress();
  const { data: tiers } = useBattlePassTiers();

  const nextTiers = tiers?.filter(t => t.level > currentLevel).slice(0, 3) || [];

  if (compact) {
    return (
      <motion.div
        whileTap={{ scale: 0.98 }}
        onClick={() => navigate('/challenges')}
        className="cursor-pointer"
      >
        <GlassCard className="p-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center">
              <Star className="h-5 w-5 text-yellow-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold">Level {currentLevel}</span>
                <span className="text-xs text-muted-foreground">{xpToNextLevel} XP to next</span>
              </div>
              <Progress value={progressPercent} variant="reward" className="h-2" />
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </GlassCard>
      </motion.div>
    );
  }

  return (
    <GlassCard className="p-4">
      {/* Level display */}
      <div className="flex items-center gap-4 mb-4">
        <motion.div
          className={cn(
            "relative h-16 w-16 rounded-2xl flex items-center justify-center",
            "bg-gradient-to-br from-yellow-500/20 via-orange-500/20 to-red-500/20",
            "border-2 border-yellow-500/30"
          )}
          whileHover={{ scale: 1.05 }}
        >
          <span className="text-2xl font-bold text-yellow-500">{currentLevel}</span>
          <motion.div
            className="absolute -top-1 -right-1"
            animate={{ rotate: [0, 15, -15, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Zap className="h-5 w-5 text-yellow-500 fill-yellow-500" />
          </motion.div>
        </motion.div>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Level {currentLevel}</h3>
            <span className="text-sm text-muted-foreground">{currentXP.toLocaleString()} XP</span>
          </div>
          <div className="space-y-1">
            <Progress value={progressPercent} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {xpToNextLevel.toLocaleString()} XP to Level {currentLevel + 1}
            </p>
          </div>
        </div>
      </div>

      {/* Upcoming rewards */}
      {showTiers && nextTiers.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border/50">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            Upcoming Rewards
          </h4>
          <div className="space-y-2">
            {nextTiers.map((tier, idx) => (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={cn(
                  "flex items-center gap-3 p-2 rounded-lg",
                  "bg-secondary/30",
                  tier.is_premium && "border border-purple-500/30"
                )}
              >
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-lg">
                  {tier.reward_icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{tier.reward_name}</p>
                  <p className="text-xs text-muted-foreground">Level {tier.level}</p>
                </div>
                {tier.is_premium && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                    Premium
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

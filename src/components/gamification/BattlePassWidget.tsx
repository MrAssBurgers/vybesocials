import { memo } from 'react';
import { motion } from 'framer-motion';
import { Swords, Star, Lock, CheckCircle2, ChevronRight } from 'lucide-react';
import { useVybePassTiers, useNextLevelProgress } from '@/hooks/useVybePass';
import { useChallengesWithProgress } from '@/hooks/useChallenges';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';

export const BattlePassWidget = memo(function BattlePassWidget() {
  const navigate = useNavigate();
  const { data: tiers } = useVybePassTiers();
  const levelProgress = useNextLevelProgress();
  const { daily } = useChallengesWithProgress();

  const completedDaily = daily.filter(c => c.is_completed).length;
  const totalDaily = daily.length;

  // Show next 3 tiers from current level
  const currentLevel = levelProgress?.currentLevel || 1;
  const upcomingTiers = (tiers || [])
    .filter(t => t.level >= currentLevel)
    .slice(0, 4);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-4 mt-1 mb-3"
    >
      {/* Header */}
      <button
        onClick={() => navigate('/challenges')}
        className="w-full flex items-center justify-between mb-3"
      >
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary/30 to-accent/30 flex items-center justify-center">
            <Swords className="h-4 w-4 text-primary" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-foreground">VYBE Pass</h3>
            <p className="text-[10px] text-muted-foreground">
              Level {currentLevel} • {completedDaily}/{totalDaily} daily quests
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>

      {/* Level progress */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] font-semibold text-muted-foreground">
            Level {currentLevel}
          </span>
          <span className="text-[10px] text-primary font-bold">
            {levelProgress?.currentXP || 0} / {levelProgress?.nextLevelXP || 1000} XP
          </span>
        </div>
        <Progress 
          value={levelProgress ? (levelProgress.currentXP / levelProgress.xpForNext) * 100 : 0} 
          className="h-2 bg-muted/40"
        />
      </div>

      {/* Daily quests mini */}
      {daily.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {daily.slice(0, 3).map((quest, i) => (
            <motion.div
              key={quest.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl border transition-all",
                quest.is_completed
                  ? "bg-primary/10 border-primary/20"
                  : "bg-card/40 border-border/20"
              )}
            >
              {quest.is_completed ? (
                <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
              ) : (
                <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />
              )}
              <span className={cn(
                "text-xs font-medium flex-1 truncate",
                quest.is_completed ? "text-primary line-through" : "text-foreground"
              )}>
                {quest.title}
              </span>
              <span className="text-[10px] font-bold text-primary/80">
                +{quest.reward_xp} XP
              </span>
            </motion.div>
          ))}
        </div>
      )}

      {/* Upcoming tier rewards */}
      {upcomingTiers.length > 0 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          {upcomingTiers.map((tier, i) => {
            const unlocked = currentLevel >= tier.level;
            return (
              <motion.div
                key={tier.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 + i * 0.05 }}
                className={cn(
                  "flex-shrink-0 w-16 flex flex-col items-center gap-1 p-2 rounded-xl border text-center",
                  unlocked
                    ? "bg-primary/10 border-primary/20"
                    : tier.is_premium
                      ? "bg-accent/5 border-accent/20"
                      : "bg-card/30 border-border/20"
                )}
              >
                <div className="text-lg">
                  {unlocked ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : tier.is_premium ? (
                    <Star className="h-5 w-5 text-accent" />
                  ) : (
                    <Lock className="h-5 w-5 text-muted-foreground/40" />
                  )}
                </div>
                <span className="text-[9px] font-bold text-muted-foreground">Lv.{tier.level}</span>
                <span className="text-[9px] text-foreground/70 truncate w-full">{tier.reward_name}</span>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
});

import { useState } from 'react';
import { useChallengeCountdown } from '@/hooks/useChallengeCountdown';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Zap, Trophy, Clock, CheckCircle2, Gift, Flame, Star, ChevronRight, RefreshCw, Timer } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { useChallengesWithProgress, CHALLENGE_ROUTES } from '@/hooks/useChallenges';
import { useUnclaimedRewards, useClaimReward, useNextLevelProgress, useVybePassTiers } from '@/hooks/useVybePass';
import { GlassCard } from '@/components/ui/glass/GlassCard';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { VybePassSheet } from '@/components/vybepass/VybePassSheet';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const TYPE_CONFIG = {
  daily: {
    label: 'Daily',
    icon: Zap,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  weekly: {
    label: 'Weekly',
    icon: Clock,
    color: 'text-accent',
    bgColor: 'bg-accent/10',
  },
  achievement: {
    label: 'Achievement',
    icon: Trophy,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
};

export default function ChallengesHubPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { daily, weekly, achievements, all } = useChallengesWithProgress();
  const { data: unclaimedRewards } = useUnclaimedRewards();
  const { data: tiers } = useVybePassTiers();
  const { currentXP, currentLevel, progressPercent, xpToNextLevel } = useNextLevelProgress();
  const claimReward = useClaimReward();
  const [activeTab, setActiveTab] = useState<string>('all');
  const [vybePassOpen, setVybePassOpen] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const { dailyTimeLeft, weeklyTimeLeft } = useChallengeCountdown();

  const handleChallengeClick = (challenge: typeof all[0]) => {
    // If completed but not claimed, find reward and claim it
    if (challenge.is_completed && !challenge.is_claimed) {
      const reward = unclaimedRewards?.find(r => r.challenge_id === challenge.id);
      if (reward) {
        handleClaimReward(reward.id);
        return;
      }
    }
    if (challenge.is_completed) return;
    
    const route = CHALLENGE_ROUTES[challenge.requirement_type];
    if (route) {
      toast.info(`Complete this challenge: ${challenge.title}`);
      navigate(route);
    }
  };

  const handleSyncProgress = async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.rpc('force_sync_my_challenges');
      if (error) throw error;
      
      await queryClient.invalidateQueries({ queryKey: ['challenge-progress'] });
      await queryClient.invalidateQueries({ queryKey: ['unclaimed-rewards'] });
      toast.success('Challenges synced!');
    } catch (error) {
      toast.error('Failed to sync challenges');
    } finally {
      setSyncing(false);
    }
  };

  const isLoading = all.length === 0;
  const completedCount = all.filter(c => c.is_completed).length;
  const totalXP = all.reduce((sum, c) => sum + (c.is_completed ? c.reward_xp : 0), 0);

  const getDisplayChallenges = () => {
    switch (activeTab) {
      case 'daily':
        return daily;
      case 'weekly':
        return weekly;
      case 'achievements':
        return achievements;
      default:
        return all;
    }
  };

  const displayChallenges = getDisplayChallenges();

  const handleClaimReward = async (rewardId: string) => {
    setClaimingId(rewardId);
    try {
      const result = await claimReward.mutateAsync(rewardId);
      // Also invalidate claimed-rewards so UI updates
      await queryClient.invalidateQueries({ queryKey: ['claimed-rewards'] });
      await queryClient.invalidateQueries({ queryKey: ['unclaimed-rewards'] });
      await queryClient.invalidateQueries({ queryKey: ['challenge-progress'] });
      if (result.level_result?.level_up) {
        toast.success(`🎉 Level Up! You're now level ${result.level_result.new_level}!`);
      } else {
        toast.success(`+${result.xp_gained} XP claimed!`);
      }
    } catch (error) {
      toast.error('Failed to claim reward');
    } finally {
      setClaimingId(null);
    }
  };

  // Get next tier reward for display
  const nextTier = tiers?.find(t => t.level === currentLevel + 1);

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
                <Target className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">Challenges</h1>
                <p className="text-sm text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
                  Complete challenges to earn badges and XP
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSyncProgress}
              disabled={syncing}
              className="shrink-0 h-10 w-10 rounded-xl bg-primary/10"
              title="Sync progress"
            >
              <RefreshCw className={cn("h-5 w-5 text-primary", syncing && "animate-spin")} />
            </Button>
          </div>

          {/* VYBE Pass Progress Card */}
          <motion.div
            whileTap={{ scale: 0.98 }}
            onClick={() => setVybePassOpen(true)}
            className="cursor-pointer mb-4"
          >
            <GlassCard className="p-4 border-primary/20">
              <div className="flex items-center gap-4">
                {/* Level badge */}
                <div className={cn(
                  "relative h-14 w-14 rounded-2xl flex items-center justify-center shrink-0",
                  "bg-gradient-to-br from-primary/20 via-accent/20 to-primary/20",
                  "border-2 border-primary/30"
                )}>
                  <span className="text-xl font-bold text-primary">{currentLevel}</span>
                  <motion.div
                    className="absolute -top-1 -right-1"
                    animate={{ rotate: [0, 15, -15, 0] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <Zap className="h-4 w-4 text-primary fill-primary" />
                  </motion.div>
                </div>

                {/* Progress */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">Level {currentLevel}</span>
                    <span className="text-sm text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">{currentXP.toLocaleString()} XP</span>
                  </div>
                  <Progress value={progressPercent} className="h-2 mb-1" />
                  <div className="flex items-center justify-between text-xs text-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                    <span>{xpToNextLevel.toLocaleString()} XP to next level</span>
                    {nextTier && (
                      <span className="flex items-center gap-1">
                        <span>{nextTier.reward_icon}</span>
                        <span>{nextTier.reward_name}</span>
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight className="h-5 w-5 text-foreground/70 shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
              </div>
            </GlassCard>
          </motion.div>

          {/* Unclaimed Rewards */}
          {unclaimedRewards && unclaimedRewards.length > 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="mb-4"
            >
              <GlassCard className="p-4 border-primary/30 bg-primary/5">
                <div className="flex items-center gap-2 mb-3">
                  <Gift className="h-5 w-5 text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
                  <h3 className="font-semibold text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">Claim Your Rewards!</h3>
                  <Badge variant="secondary" className="ml-auto">
                    {unclaimedRewards.length} pending
                  </Badge>
                </div>
                <div className="space-y-2">
                  {unclaimedRewards.slice(0, 3).map((reward) => (
                    <motion.div
                      key={reward.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-3 p-2 rounded-lg bg-background/50"
                    >
                      <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Star className="h-5 w-5 text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
                          {reward.challenge?.title || 'Challenge Completed'}
                        </p>
                        <p className="text-xs text-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">+{reward.xp_amount} XP</p>
                      </div>
                      <motion.div
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.92 }}
                      >
                        <Button
                          size="default"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClaimReward(reward.id);
                          }}
                          disabled={claimingId === reward.id}
                          className="shrink-0 px-5 py-2.5 text-sm font-bold shadow-[0_0_16px_hsl(var(--primary)/0.4)] hover:shadow-[0_0_24px_hsl(var(--primary)/0.6)] transition-shadow relative overflow-hidden"
                        >
                          {claimingId === reward.id ? (
                            <motion.div
                              animate={{ rotate: 360 }}
                              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                            >
                              <Star className="h-4 w-4" />
                            </motion.div>
                          ) : (
                            <motion.span
                              className="flex items-center gap-1.5"
                              animate={{ 
                                textShadow: [
                                  '0 0 4px hsl(var(--primary-foreground) / 0.3)',
                                  '0 0 12px hsl(var(--primary-foreground) / 0.6)',
                                  '0 0 4px hsl(var(--primary-foreground) / 0.3)',
                                ]
                              }}
                              transition={{ duration: 2, repeat: Infinity }}
                            >
                              <Gift className="h-4 w-4" />
                              Claim
                            </motion.span>
                          )}
                        </Button>
                      </motion.div>
                    </motion.div>
                  ))}
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-3">
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">{completedCount}</p>
                  <p className="text-xs text-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">Completed</p>
                </div>
              </div>
            </GlassCard>
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <Flame className="h-5 w-5 text-accent drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">{totalXP}</p>
                  <p className="text-xs text-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">XP Earned</p>
                </div>
              </div>
            </GlassCard>
          </div>

          {/* Reset Timers */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <GlassCard className="p-3">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">Daily resets in</p>
                  <p className="text-sm font-bold text-primary tabular-nums">{dailyTimeLeft}</p>
                </div>
              </div>
            </GlassCard>
            <GlassCard className="p-3">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-accent shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">Weekly resets in</p>
                  <p className="text-sm font-bold text-accent tabular-nums">{weeklyTimeLeft}</p>
                </div>
              </div>
            </GlassCard>
          </div>
        </motion.div>

        {/* Category Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="w-full h-12 p-1">
            <TabsTrigger value="all" className="flex-1 gap-1">
              <Target className="h-4 w-4" />
              All
            </TabsTrigger>
            <TabsTrigger value="daily" className="flex-1 gap-1">
              <Zap className="h-4 w-4" />
              Daily
            </TabsTrigger>
            <TabsTrigger value="weekly" className="flex-1 gap-1">
              <Clock className="h-4 w-4" />
              Weekly
            </TabsTrigger>
            <TabsTrigger value="achievements" className="flex-1 gap-1">
              <Trophy className="h-4 w-4" />
              Permanent
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Challenges List */}
        <AnimatePresence mode="popLayout">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : displayChallenges.length > 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
            >
              {displayChallenges.map((challenge, idx) => {
                const config = TYPE_CONFIG[challenge.type as keyof typeof TYPE_CONFIG];
                const Icon = config?.icon || Target;
                
                return (
                  <motion.div
                    key={challenge.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    <div 
                      className={cn(
                        !challenge.is_completed && "cursor-pointer"
                      )}
                      onClick={() => handleChallengeClick(challenge)}
                    >
                      <GlassCard 
                        className={cn(
                          "p-4 relative overflow-hidden transition-colors",
                          challenge.is_completed 
                            ? "border-primary/30 bg-primary/5" 
                            : "hover:border-primary/40"
                        )}
                      >
                        <div className="flex items-start gap-4">
                          {/* Icon */}
                          <div className={cn(
                            "h-12 w-12 rounded-xl flex items-center justify-center shrink-0",
                            config?.bgColor || 'bg-secondary'
                          )}>
                            {challenge.is_completed ? (
                              <CheckCircle2 className="h-6 w-6 text-primary" />
                            ) : (
                              <Icon className={cn("h-6 w-6", config?.color)} />
                            )}
                          </div>
                          
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold truncate text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">{challenge.title}</h3>
                              <Badge variant="secondary" className="shrink-0">
                                {config?.label}
                              </Badge>
                            </div>
                            
                            {challenge.description && (
                              <p className="text-sm text-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)] mb-2 line-clamp-1">
                                {challenge.description}
                              </p>
                            )}
                            
                            {/* Progress */}
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                                  {challenge.current_count} / {challenge.requirement_count}
                                </span>
                                <span className="text-primary flex items-center gap-1 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                                  <Gift className="h-3 w-3" />
                                  +{challenge.reward_xp} XP
                                </span>
                              </div>
                              <Progress 
                                value={challenge.progress_percentage} 
                                className="h-1.5"
                              />
                            </div>
                          </div>
                        </div>
                        
                        {/* Completed overlay */}
                        {challenge.is_completed && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="absolute top-2 right-2"
                          >
                            {challenge.is_claimed ? (
                              <Badge className="bg-muted-foreground/60 text-primary-foreground px-3 py-1">
                                ✓ Completed
                              </Badge>
                            ) : (
                              <motion.div
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                animate={{ 
                                  boxShadow: [
                                    '0 0 8px hsl(var(--primary) / 0.3)',
                                    '0 0 20px hsl(var(--primary) / 0.6)',
                                    '0 0 8px hsl(var(--primary) / 0.3)',
                                  ]
                                }}
                                transition={{ duration: 1.5, repeat: Infinity }}
                                className="rounded-full"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const reward = unclaimedRewards?.find(r => r.challenge_id === challenge.id);
                                  if (reward) {
                                    handleClaimReward(reward.id);
                                  } else {
                                    // Reward may not be created yet — trigger click on card
                                    handleChallengeClick(challenge);
                                  }
                                }}
                              >
                                <Badge className="bg-primary text-primary-foreground px-4 py-1.5 text-sm font-bold cursor-pointer">
                                  {claimingId && unclaimedRewards?.find(r => r.challenge_id === challenge.id)?.id === claimingId
                                    ? '⏳ Claiming...'
                                    : '🎁 Claim XP'
                                  }
                                </Badge>
                              </motion.div>
                            )}
                          </motion.div>
                        )}
                      </GlassCard>
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-16"
            >
              <GlassCard className="p-8 inline-block">
                <Trophy className="h-12 w-12 text-primary mx-auto mb-4 drop-shadow-[0_2px_4px_rgba(0,0,0,0.4)]" />
                <h3 className="text-lg font-semibold text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)] mb-2">No challenges available</h3>
                <p className="text-sm text-foreground/70 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                  Check back later for new challenges!
                </p>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* VYBE Pass Sheet */}
      <VybePassSheet open={vybePassOpen} onOpenChange={setVybePassOpen} />
    </AppLayout>
  );
}

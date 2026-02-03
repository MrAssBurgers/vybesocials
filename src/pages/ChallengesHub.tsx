import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Target, Zap, Trophy, Clock, CheckCircle2, Gift, Flame } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useChallengesWithProgress } from '@/hooks/useChallenges';
import { GlassCard } from '@/components/ui/glass/GlassCard';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const TYPE_CONFIG = {
  daily: {
    label: 'Daily',
    icon: Zap,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
  weekly: {
    label: 'Weekly',
    icon: Clock,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  achievement: {
    label: 'Achievement',
    icon: Trophy,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
};

export default function ChallengesHubPage() {
  const { daily, weekly, achievements, all } = useChallengesWithProgress();
  const [activeTab, setActiveTab] = useState<string>('all');

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

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <Target className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Challenges</h1>
              <p className="text-sm text-muted-foreground">
                Complete challenges to earn badges and XP
              </p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-3">
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{completedCount}</p>
                  <p className="text-xs text-muted-foreground">Completed</p>
                </div>
              </div>
            </GlassCard>
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-accent/10 flex items-center justify-center">
                  <Flame className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalXP}</p>
                  <p className="text-xs text-muted-foreground">XP Earned</p>
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
                    <GlassCard 
                      className={cn(
                        "p-4 relative overflow-hidden",
                        challenge.is_completed && "border-primary/30 bg-primary/5"
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
                            <h3 className="font-semibold truncate">{challenge.title}</h3>
                            <Badge variant="secondary" className="shrink-0">
                              {config?.label}
                            </Badge>
                          </div>
                          
                          {challenge.description && (
                            <p className="text-sm text-muted-foreground mb-2 line-clamp-1">
                              {challenge.description}
                            </p>
                          )}
                          
                          {/* Progress */}
                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted-foreground">
                                {challenge.current_count} / {challenge.requirement_count}
                              </span>
                              <span className="text-primary flex items-center gap-1">
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
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          className="absolute top-2 right-2"
                        >
                          <Badge className="bg-primary text-primary-foreground">
                            ✓ Complete
                          </Badge>
                        </motion.div>
                      )}
                    </GlassCard>
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
                <Trophy className="h-12 w-12 text-primary mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No challenges available</h3>
                <p className="text-sm text-muted-foreground">
                  Check back later for new challenges!
                </p>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppLayout>
  );
}

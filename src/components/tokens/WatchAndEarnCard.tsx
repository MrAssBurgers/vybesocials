import { motion, AnimatePresence } from 'framer-motion';
import { Play, Coins, Clock, CheckCircle2, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useRewardedAd } from '@/hooks/useRewardedAd';
import { cn } from '@/lib/utils';

function formatCooldown(ms: number) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
}

export function WatchAndEarnCard() {
  const {
    watchAd,
    canWatch,
    isLoading,
    onCooldown,
    cooldownRemaining,
    capReached,
    remainingToday,
    dailyLimit,
    rewardPerAd,
    watchedToday,
    isNative,
  } = useRewardedAd();

  const progress = (watchedToday / dailyLimit) * 100;
  const totalEarnable = dailyLimit * rewardPerAd;
  const earnedToday = watchedToday * rewardPerAd;

  return (
    <Card className="overflow-hidden relative">
      {/* Animated gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-accent/10 to-transparent pointer-events-none" />
      <motion.div
        className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-primary/20 blur-3xl pointer-events-none"
        animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />

      <div className="relative p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-base">Watch & Earn</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Watch a short video to earn{' '}
              <span className="text-primary font-semibold">+{rewardPerAd} tokens</span>.
              Up to {totalEarnable} per day.
            </p>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/15 border border-primary/30 shrink-0">
            <Coins className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-bold text-primary">+{rewardPerAd}</span>
          </div>
        </div>

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {watchedToday} / {dailyLimit} ads today
            </span>
            <span className="font-semibold text-emerald-500">
              +{earnedToday} earned
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* CTA */}
        <Button
          onClick={watchAd}
          disabled={!canWatch}
          size="lg"
          className={cn(
            'w-full h-12 rounded-xl font-semibold relative overflow-hidden',
            canWatch && 'gradient-animated text-primary-foreground'
          )}
          variant={canWatch ? 'default' : 'secondary'}
        >
          <AnimatePresence mode="wait">
            {capReached ? (
              <motion.span
                key="cap"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                <CheckCircle2 className="w-5 h-5" />
                Daily limit reached — back tomorrow
              </motion.span>
            ) : onCooldown ? (
              <motion.span
                key="cd"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                <Clock className="w-5 h-5" />
                Next ad in {formatCooldown(cooldownRemaining)}
              </motion.span>
            ) : isLoading ? (
              <motion.span
                key="load"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-5 h-5 border-2 border-current border-t-transparent rounded-full"
                />
                Loading ad…
              </motion.span>
            ) : (
              <motion.span
                key="play"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2"
              >
                <Play className="w-5 h-5 fill-current" />
                Watch ad · +{rewardPerAd} tokens
              </motion.span>
            )}
          </AnimatePresence>
        </Button>

        {!isNative && (
          <p className="text-[11px] text-center text-muted-foreground">
            Available in the mobile app
          </p>
        )}
      </div>
    </Card>
  );
}

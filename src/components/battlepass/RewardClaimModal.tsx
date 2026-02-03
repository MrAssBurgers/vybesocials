import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Gift, Sparkles, Star, Trophy, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChallengeReward, useClaimReward } from '@/hooks/useBattlePass';
import { cn } from '@/lib/utils';

interface RewardClaimModalProps {
  reward: ChallengeReward | null;
  open: boolean;
  onClose: () => void;
}

export function RewardClaimModal({ reward, open, onClose }: RewardClaimModalProps) {
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const claimReward = useClaimReward();

  const handleClaim = async () => {
    if (!reward) return;
    
    setIsClaiming(true);
    try {
      await claimReward.mutateAsync(reward.id);
      setClaimed(true);
      setTimeout(() => {
        onClose();
        setClaimed(false);
      }, 2000);
    } catch (error) {
      console.error('Failed to claim reward:', error);
    } finally {
      setIsClaiming(false);
    }
  };

  const handleClose = () => {
    if (!isClaiming) {
      onClose();
      setClaimed(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-center text-xl">
            {claimed ? '🎉 Reward Claimed!' : '🎯 Challenge Complete!'}
          </DialogTitle>
        </DialogHeader>

        <div className="relative py-6">
          {/* Background particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {Array.from({ length: 12 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 rounded-full bg-primary/30"
                initial={{ 
                  x: '50%', 
                  y: '50%', 
                  scale: 0,
                  opacity: 1 
                }}
                animate={claimed ? { 
                  x: `${50 + (Math.random() - 0.5) * 100}%`,
                  y: `${50 + (Math.random() - 0.5) * 100}%`,
                  scale: [0, 1.5, 0],
                  opacity: [1, 1, 0],
                } : {}}
                transition={{ 
                  duration: 1,
                  delay: i * 0.05,
                  ease: 'easeOut' 
                }}
              />
            ))}
          </div>

          {/* Main reward display */}
          <motion.div
            className="flex flex-col items-center"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', duration: 0.5 }}
          >
            {/* Reward icon */}
            <motion.div
              className={cn(
                "relative h-24 w-24 rounded-2xl flex items-center justify-center mb-4",
                "bg-gradient-to-br from-primary/20 via-accent/20 to-primary/20",
                "border-2 border-primary/30"
              )}
              animate={claimed ? { 
                scale: [1, 1.2, 1],
                rotate: [0, 10, -10, 0],
              } : {}}
              transition={{ duration: 0.5 }}
            >
              <Gift className="h-12 w-12 text-primary" />
              
              {/* Sparkle effects */}
              <motion.div
                className="absolute -top-2 -right-2"
                animate={{ rotate: 360 }}
                transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              >
                <Sparkles className="h-6 w-6 text-yellow-500" />
              </motion.div>
            </motion.div>

            {/* Challenge title */}
            <h3 className="text-lg font-semibold text-center mb-2">
              {reward?.challenge?.title || 'Challenge Completed'}
            </h3>

            {/* XP reward */}
            <motion.div
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-full",
                "bg-gradient-to-r from-yellow-500/20 to-orange-500/20",
                "border border-yellow-500/30"
              )}
              animate={claimed ? {
                scale: [1, 1.1, 1],
              } : {}}
              transition={{ duration: 0.3 }}
            >
              <Star className="h-5 w-5 text-yellow-500" />
              <span className="font-bold text-yellow-500">
                +{reward?.xp_amount || 0} XP
              </span>
            </motion.div>

            {/* Badge reward indicator */}
            {reward?.badge_id && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Trophy className="h-4 w-4 text-purple-500" />
                <span>+ Badge Unlocked!</span>
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* Claim button */}
        <AnimatePresence mode="wait">
          {!claimed ? (
            <motion.div
              key="claim-button"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <Button
                onClick={handleClaim}
                disabled={isClaiming}
                className="w-full h-12 text-lg font-semibold bg-gradient-to-r from-primary to-accent hover:opacity-90"
              >
                {isClaiming ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  >
                    <Sparkles className="h-5 w-5" />
                  </motion.div>
                ) : (
                  <>
                    <Gift className="h-5 w-5 mr-2" />
                    Claim Reward
                  </>
                )}
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="claimed-state"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-2"
            >
              <span className="text-lg font-semibold text-primary">
                ✨ Added to your account!
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

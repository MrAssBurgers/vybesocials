import { motion, AnimatePresence } from 'framer-motion';
import { Star, Gift, Trophy, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChallengeReward, useClaimReward } from '@/hooks/useVybePass';
import { cn } from '@/lib/utils';

interface RewardClaimModalProps {
  reward: ChallengeReward | null;
  open: boolean;
  onClose: () => void;
}

export function RewardClaimModal({ reward, open, onClose }: RewardClaimModalProps) {
  const claimReward = useClaimReward();

  const handleClaim = async () => {
    if (!reward) return;
    
    try {
      await claimReward.mutateAsync(reward.id);
      onClose();
    } catch (error) {
      console.error('Failed to claim reward:', error);
    }
  };

  if (!reward) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 10, stiffness: 100 }}
              className="mx-auto mb-4 h-20 w-20 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center"
            >
              <Gift className="h-10 w-10 text-primary" />
            </motion.div>
            <span className="text-xl">Challenge Complete!</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Challenge info */}
          <div className="text-center">
            <h3 className="font-semibold text-lg">
              {reward.challenge?.title || 'Challenge'}
            </h3>
            {reward.challenge?.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {reward.challenge.description}
              </p>
            )}
          </div>

          {/* XP reward */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={cn(
              "p-4 rounded-xl text-center",
              "bg-gradient-to-br from-primary/10 to-accent/10",
              "border border-primary/20"
            )}
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="text-3xl font-bold text-primary">
                +{reward.xp_amount}
              </span>
              <span className="text-xl font-semibold text-primary">XP</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Added to your VYBE Pass
            </p>
          </motion.div>

          {/* Badge reward if present */}
          {reward.badge_id && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex items-center justify-center gap-3 p-4 rounded-xl bg-secondary/50"
            >
              <Trophy className="h-8 w-8 text-yellow-500" />
              <div className="text-left">
                <p className="font-semibold">New Badge Unlocked!</p>
                <p className="text-sm text-muted-foreground">Check your profile</p>
              </div>
            </motion.div>
          )}
        </div>

        <Button 
          onClick={handleClaim} 
          disabled={claimReward.isPending}
          className="w-full"
          size="lg"
        >
          {claimReward.isPending ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            >
              <Star className="h-5 w-5" />
            </motion.div>
          ) : (
            <>
              <Gift className="h-5 w-5 mr-2" />
              Claim Reward
            </>
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

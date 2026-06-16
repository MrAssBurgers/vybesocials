import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Gift, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/firebase';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PremiumActivationAnimation } from './PremiumActivationAnimation';

interface PremiumGiftNotificationProps {
  giftId: string;
  gifterUsername: string;
  onDismiss: () => void;
}

export function PremiumGiftNotification({ giftId, gifterUsername, onDismiss }: PremiumGiftNotificationProps) {
  const [accepting, setAccepting] = useState(false);
  const [showAnimation, setShowAnimation] = useState(false);
  const queryClient = useQueryClient();

  const handleAccept = async () => {
    setAccepting(true);
    try {
      const { error } = await db
        .from('gifted_premium')
        .update({
          is_active: true,
          status: 'accepted',
          accepted_at: new Date().toISOString(),
        })
        .eq('id', giftId);

      if (error) throw error;

      // Show the cool animation
      setShowAnimation(true);
    } catch {
      toast.error('Failed to accept premium');
      setAccepting(false);
    }
  };

  const handleAnimationComplete = () => {
    setShowAnimation(false);
    queryClient.invalidateQueries({ queryKey: ['db-premium-status'] });
    queryClient.invalidateQueries({ queryKey: ['pending-premium-gift'] });
    onDismiss();
  };

  if (showAnimation) {
    return <PremiumActivationAnimation open onComplete={handleAnimationComplete} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      className="fixed inset-0 z-[9998] flex items-center justify-center p-6"
    >
      <div className="absolute inset-0 bg-background/80 backdrop-blur-lg" onClick={onDismiss} />

      <motion.div
        className="relative z-10 w-full max-w-sm rounded-3xl border border-primary/20 bg-card p-6 shadow-2xl"
        initial={{ y: 30 }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
      >
        {/* Glow */}
        <div className="absolute -inset-px rounded-3xl bg-gradient-to-b from-primary/20 via-transparent to-transparent pointer-events-none" />

        <div className="flex flex-col items-center text-center relative">
          {/* Gift icon */}
          <motion.div
            className="relative w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 via-accent/15 to-primary/10 flex items-center justify-center border border-primary/25 mb-4"
            animate={{ rotateZ: [-3, 3, -3] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Gift className="h-10 w-10 text-primary" />
            <motion.div
              className="absolute -top-1 -right-1 h-7 w-7 rounded-full bg-primary flex items-center justify-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: 'spring' }}
            >
              <Crown className="h-3.5 w-3.5 text-primary-foreground" />
            </motion.div>
          </motion.div>

          <h2 className="text-xl font-black mb-1">You've Been Gifted Premium! 🎁</h2>
          <p className="text-sm text-muted-foreground mb-5">
            <strong>@{gifterUsername}</strong> gifted you VYBE Premium with all {40}+ perks!
          </p>

          <Button
            size="lg"
            className="w-full h-12 text-base font-bold gap-2"
            onClick={handleAccept}
            disabled={accepting}
          >
            {accepting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Accept Premium
          </Button>

          <button
            onClick={onDismiss}
            className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Maybe later
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

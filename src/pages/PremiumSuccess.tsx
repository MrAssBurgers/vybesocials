import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Crown, Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

export default function PremiumSuccess() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    // Invalidate premium status so it refreshes everywhere
    queryClient.invalidateQueries({ queryKey: ['premium-status'] });
    queryClient.invalidateQueries({ queryKey: ['revenuecat'] });
  }, [queryClient]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
      <motion.div
        initial={{ scale: 0, rotate: -20 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15 }}
        className="mb-6"
      >
        <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/30 flex items-center justify-center mx-auto">
          <Crown className="w-12 h-12 text-primary" />
          <motion.div
            className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-green-500 flex items-center justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.3, type: 'spring' }}
          >
            <Check className="w-5 h-5 text-white" />
          </motion.div>
        </div>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-3xl font-black mb-2 text-foreground"
      >
        Welcome to Premium! 🎉
      </motion.h1>

      <motion.p
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-muted-foreground mb-8 max-w-sm"
      >
        You now have access to all premium perks, exclusive cosmetics, and ad-free browsing across all your devices.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="flex flex-col gap-3 w-full max-w-xs"
      >
        <Button size="lg" onClick={() => navigate('/')} className="w-full font-bold">
          <Sparkles className="w-4 h-4 mr-2" />
          Start Exploring
        </Button>
        <Button variant="outline" size="lg" onClick={() => navigate('/settings')} className="w-full">
          View Your Subscription
        </Button>
      </motion.div>
    </div>
  );
}

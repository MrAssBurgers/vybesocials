import { memo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { liquidSpring } from '@/motion/liquidConfig';
import { Confetti } from '@/components/easter-eggs/Confetti';

export const CaughtUpScreen = memo(function CaughtUpScreen() {
  const navigate = useNavigate();
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowConfetti(true), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={liquidSpring}
      className="py-10 flex flex-col items-center gap-4 text-center"
    >
      {showConfetti && <Confetti />}

      {/* Animated SVG checkmark */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ ...liquidSpring, delay: 0.1 }}
        className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center"
      >
        <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
          <motion.path
            d="M8 16 L14 22 L24 10"
            stroke="hsl(var(--primary))"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
          />
        </svg>
      </motion.div>

      <div>
        <h3 className="text-base font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent flex items-center justify-center gap-2">
          <motion.span
            animate={{ rotate: [0, 15, -15, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
          >
            🎉
          </motion.span>
          You're all caught up
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          You've seen all new posts from the last 48 hours
        </p>
      </div>

      <div className="flex gap-3 mt-2">
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={() => navigate('/invite-friends')}
        >
          <Users className="h-4 w-4 mr-1.5" />
          Invite Friends
        </Button>
        <Button
          size="sm"
          className="rounded-full"
          onClick={() => navigate('/explore')}
        >
          Explore More
        </Button>
      </div>
    </motion.div>
  );
});

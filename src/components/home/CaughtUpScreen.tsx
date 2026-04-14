import { memo } from 'react';
import { motion } from 'framer-motion';
import { Check, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { liquidSpring } from '@/motion/liquidConfig';

export const CaughtUpScreen = memo(function CaughtUpScreen() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={liquidSpring}
      className="py-10 flex flex-col items-center gap-4 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ ...liquidSpring, delay: 0.1 }}
        className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center"
      >
        <Check className="h-8 w-8 text-primary" strokeWidth={2.5} />
      </motion.div>
      <div>
        <h3 className="text-base font-bold text-foreground">You're all caught up</h3>
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

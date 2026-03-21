import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { LiveActivityTicker } from './LiveActivityTicker';

export function GreetingWidget() {
  const { profile } = useAuth();

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 5) return 'Night owl vibes';
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    if (hour < 21) return 'Good evening';
    return 'Good night';
  }, []);

  if (!profile) return null;

  return (
    <div className="px-4 pt-4 pb-2">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <h1 className="text-xl font-bold text-foreground drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
          {greeting}, <span className="text-primary drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">@{profile.username}</span>
        </h1>
        <LiveActivityTicker />
      </motion.div>
    </div>
  );
}

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useActivityStats } from '@/hooks/useActivityStats';

/**
 * Rotating live activity ticker showing subtle platform activity signals.
 * Cycles through available stats every 4 seconds with smooth fade transitions.
 */
export function LiveActivityTicker() {
  const { data: stats } = useActivityStats();
  const [currentIndex, setCurrentIndex] = useState(0);

  // Build available messages based on real data
  const messages = useMemo(() => {
    if (!stats) return [];
    const msgs: { emoji: string; text: string }[] = [];

    if (stats.activeLevelUps > 0) {
      msgs.push({ emoji: '🔥', text: `${stats.activeLevelUps} people leveling up today` });
    }
    if (stats.activeChats > 0) {
      msgs.push({ emoji: '💬', text: `${stats.activeChats} active chats right now` });
    }
    if (stats.recentPosts > 0) {
      msgs.push({ emoji: '⚡', text: `${stats.recentPosts} new posts in the last 5 min` });
    }
    if (stats.badgesClaimed > 0) {
      msgs.push({ emoji: '💎', text: `${stats.badgesClaimed} rewards claimed today` });
    }

    // Fallback if no live data
    if (msgs.length === 0) {
      msgs.push({ emoji: '✨', text: 'VYBE is waking up — be the first!' });
    }

    return msgs;
  }, [stats]);

  // Cycle through messages
  useEffect(() => {
    if (messages.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % messages.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [messages.length]);

  if (messages.length === 0) return null;

  const current = messages[currentIndex % messages.length];

  return (
    <div className="h-5 overflow-hidden relative">
      <AnimatePresence mode="wait">
        <motion.p
          key={currentIndex}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="text-xs text-muted-foreground absolute inset-0 flex items-center"
        >
          <span className="mr-1.5">{current.emoji}</span>
          <span>{current.text}</span>
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

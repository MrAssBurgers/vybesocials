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
      msgs.push({
        emoji: '🔥',
        text:
          stats.activeLevelUps === 1
            ? '1 person is leveling up today'
            : `${stats.activeLevelUps} people are leveling up today`,
      });
    }
    if (stats.activeChats > 0) {
      msgs.push({
        emoji: '💬',
        text:
          stats.activeChats === 1
            ? '1 active chat right now'
            : `${stats.activeChats} active chats right now`,
      });
    }
    if (typeof stats.recentPosts === 'number' && stats.recentPosts > 0) {
      msgs.push({
        emoji: '⚡',
        text:
          stats.recentPosts === 1 && !stats.recentPostsHasMore
            ? '1 new post in the last 5 min'
            : `${stats.recentPosts}${stats.recentPostsHasMore ? '+' : ''} visible posts in the last 5 min`,
      });
    }
    if (stats.badgesClaimed > 0) {
      msgs.push({
        emoji: '💎',
        text:
          stats.badgesClaimed === 1
            ? '1 reward claimed today'
            : `${stats.badgesClaimed} rewards claimed today`,
      });
    }

    return msgs;
  }, [stats]);

  // Cycle through messages — paused while the tab is hidden so the ticker
  // doesn't keep animating (and re-rendering) a page nobody is looking at.
  useEffect(() => {
    if (messages.length <= 1) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (interval) return;
      interval = setInterval(() => {
        setCurrentIndex(prev => (prev + 1) % messages.length);
      }, 4000);
    };
    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [messages.length]);

  if (messages.length === 0) return null;

  const current = messages[currentIndex % messages.length];

  return (
    <div className="h-5 overflow-hidden relative" data-no-auto-contrast>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={currentIndex}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="text-xs text-foreground/90 flex items-center drop-shadow-sm absolute inset-0"
        >
          <span className="mr-1.5">{current.emoji}</span>
          <span className="truncate">{current.text}</span>
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

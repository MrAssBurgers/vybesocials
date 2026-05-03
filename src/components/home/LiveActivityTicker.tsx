import { useState, useEffect, useMemo } from 'react';
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
    if (stats.recentPosts > 0) {
      msgs.push({
        emoji: '⚡',
        text:
          stats.recentPosts === 1
            ? '1 new post in the last 5 min'
            : `${stats.recentPosts} new posts in the last 5 min`,
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
    <div className="h-5 overflow-hidden" data-no-auto-contrast>
      <p className="text-xs text-foreground/90 flex items-center drop-shadow-sm">
        <span className="mr-1.5">{current.emoji}</span>
        <span className="truncate">{current.text}</span>
      </p>
    </div>
  );
}

import { useState, useEffect, useMemo, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Flame, Zap, TrendingUp } from 'lucide-react';
import { useRhythmData } from '@/hooks/useActivityStats';

/**
 * Rotating "Now" banner with real data — top XP gainers, challenges, trending tags.
 * Updates every 6s with smooth crossfade.
 */
export const WeeklyRhythmBanner = forwardRef<HTMLDivElement>((_, ref) => {
  const { data } = useRhythmData();
  const [currentIndex, setCurrentIndex] = useState(0);

  const cards = useMemo(() => {
    if (!data) return [];
    const items: { icon: React.ReactNode; label: string; value: string; color: string }[] = [];

    if (data.topXPGainer) {
      items.push({
        icon: <Trophy className="h-3.5 w-3.5" />,
        label: 'Top XP Today',
        value: `@${data.topXPGainer.username} · ${data.topXPGainer.xp.toLocaleString()} XP`,
        color: 'text-warning',
      });
    }

    if (data.activeChallenge) {
      items.push({
        icon: <Zap className="h-3.5 w-3.5" />,
        label: 'Challenge Ends',
        value: `${data.activeChallenge.title} · ${data.activeChallenge.endsIn}`,
        color: 'text-accent',
      });
    }

    if (data.trendingTag) {
      items.push({
        icon: <TrendingUp className="h-3.5 w-3.5" />,
        label: 'Trending',
        value: `#${data.trendingTag}`,
        color: 'text-primary',
      });
    }

    if (typeof data.totalPostsToday === 'number' && data.totalPostsToday > 0) {
      items.push({
        icon: <Flame className="h-3.5 w-3.5" />,
        label: 'Today',
        value: `${data.totalPostsToday}${data.totalPostsHasMore ? '+' : ''} visible posts shared`,
        color: 'text-destructive',
      });
    }

    return items;
  }, [data]);

  useEffect(() => {
    if (cards.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % cards.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [cards.length]);

  if (cards.length === 0) return null;

  const current = cards[currentIndex % cards.length];

  return (
    <div ref={ref} className="mx-4 mb-2">
      <div className="relative h-9 overflow-hidden rounded-lg border border-border/40 bg-card/40 backdrop-blur-sm px-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 flex items-center gap-2 px-3"
          >
            <span className={current.color}>{current.icon}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {current.label}
            </span>
            <span className="text-xs font-medium text-foreground truncate">
              {current.value}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
});

WeeklyRhythmBanner.displayName = 'WeeklyRhythmBanner';

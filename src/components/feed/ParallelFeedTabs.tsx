import { motion } from 'framer-motion';
import { Plus, Sparkles, TrendingUp, Compass, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useActiveFeed, ParallelFeed } from '@/hooks/useParallelFeeds';
import { cn } from '@/lib/utils';

const FEED_ICONS: Record<string, React.ReactNode> = {
  following: <Users className="w-4 h-4" />,
  trending: <TrendingUp className="w-4 h-4" />,
  discover: <Compass className="w-4 h-4" />,
  custom: <Sparkles className="w-4 h-4" />,
};

interface ParallelFeedTabsProps {
  onCreateFeed?: () => void;
}

export function ParallelFeedTabs({ onCreateFeed }: ParallelFeedTabsProps) {
  const { feeds, activeIndex, setFeed } = useActiveFeed();

  return (
    <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide pb-2 px-4 -mx-4">
      {feeds.map((feed, index) => (
        <motion.button
          key={feed.id}
          onClick={() => setFeed(index)}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors",
            activeIndex === index
              ? "bg-primary text-primary-foreground"
              : "bg-muted/50 text-muted-foreground hover:bg-muted"
          )}
          whileTap={{ scale: 0.95 }}
          layout
        >
          {FEED_ICONS[feed.feed_type] || FEED_ICONS.custom}
          <span>{feed.name}</span>
          {activeIndex === index && (
            <motion.div
              layoutId="feedIndicator"
              className="absolute inset-0 bg-primary rounded-full -z-10"
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          )}
        </motion.button>
      ))}
      
      {onCreateFeed && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onCreateFeed}
          className="rounded-full px-3"
        >
          <Plus className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}

/**
 * Swipeable feed container for mobile
 */
interface SwipeableFeedContainerProps {
  children: (activeFeed: ParallelFeed) => React.ReactNode;
}

export function SwipeableFeedContainer({ children }: SwipeableFeedContainerProps) {
  const { activeFeed, nextFeed, prevFeed, activeIndex, feeds } = useActiveFeed();

  const handleDragEnd = (_: any, info: { offset: { x: number } }) => {
    const threshold = 50;
    if (info.offset.x < -threshold) {
      nextFeed();
    } else if (info.offset.x > threshold) {
      prevFeed();
    }
  };

  return (
    <div className="relative overflow-hidden">
      {/* Feed indicator dots */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
        {feeds.map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-1.5 h-1.5 rounded-full transition-all",
              i === activeIndex ? "w-4 bg-primary" : "bg-muted-foreground/30"
            )}
          />
        ))}
      </div>

      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        className="touch-pan-y"
      >
        {children(activeFeed)}
      </motion.div>
    </div>
  );
}

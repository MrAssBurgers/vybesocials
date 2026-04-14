import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { liquidBouncySpring } from '@/motion/liquidConfig';

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  threshold: number;
}

export function PullToRefreshIndicator({ 
  pullDistance, 
  isRefreshing, 
  threshold 
}: PullToRefreshIndicatorProps) {
  if (pullDistance === 0 && !isRefreshing) return null;

  const progress = Math.min(pullDistance / threshold, 1);
  const shouldTrigger = pullDistance >= threshold;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{ paddingTop: `${Math.max(pullDistance - 20, 0)}px` }}
    >
      <motion.div
        className={`flex items-center justify-center w-10 h-10 rounded-full shadow-lg backdrop-blur-sm transition-colors duration-150 ${
          shouldTrigger || isRefreshing ? 'bg-primary/20' : 'bg-background/80'
        }`}
        animate={{
          rotate: isRefreshing ? 360 : shouldTrigger ? 180 : progress * 180,
          scale: 0.8 + progress * 0.2,
        }}
        transition={isRefreshing ? { duration: 0.8, repeat: Infinity, ease: 'linear' } : liquidBouncySpring}
      >
        {isRefreshing ? (
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
        ) : (
          <span className={`text-lg font-black transition-colors duration-150 ${
            shouldTrigger ? 'text-primary' : 'text-muted-foreground'
          }`}>V</span>
        )}
      </motion.div>
    </div>
  );
}

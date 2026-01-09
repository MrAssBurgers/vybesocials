import { motion } from 'framer-motion';
import { Loader2, ArrowDown } from 'lucide-react';

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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{ 
        paddingTop: `${Math.max(pullDistance - 20, 0)}px`,
        transition: isRefreshing ? 'none' : 'padding-top 0.1s ease-out'
      }}
    >
      <motion.div
        className={`flex items-center justify-center w-10 h-10 rounded-full liquid-glass shadow-lg ${
          shouldTrigger || isRefreshing ? 'bg-primary/20' : 'bg-background'
        }`}
        animate={{
          rotate: isRefreshing ? 360 : shouldTrigger ? 180 : progress * 180,
          scale: isRefreshing ? 1 : 0.8 + progress * 0.2,
        }}
        transition={{
          rotate: isRefreshing 
            ? { duration: 1, repeat: Infinity, ease: 'linear' } 
            : { duration: 0.1 },
          scale: { duration: 0.1 }
        }}
      >
        {isRefreshing ? (
          <Loader2 className="h-5 w-5 text-primary animate-spin" />
        ) : (
          <ArrowDown 
            className={`h-5 w-5 transition-colors ${
              shouldTrigger ? 'text-primary' : 'text-muted-foreground'
            }`} 
          />
        )}
      </motion.div>
    </motion.div>
  );
}

import { motion } from 'framer-motion';
import { liquidBouncySpring } from '@/motion/liquidConfig';
import { MOTION_CONFIG } from '@/lib/motion';

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  threshold: number;
}

/**
 * Premium pull-to-refresh — aurora ring that swirls and brightens as you pull.
 * Replaces the static loader spinner with a branded VYBE moment.
 */
export function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  threshold,
}: PullToRefreshIndicatorProps) {
  if (pullDistance === 0 && !isRefreshing) return null;

  const progress = Math.min(pullDistance / threshold, 1);
  const shouldTrigger = pullDistance >= threshold;
  const ringSize = 44;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
      style={{ paddingTop: `${Math.max(pullDistance - 20, 0)}px` }}
    >
      <motion.div
        className="relative flex items-center justify-center"
        style={{ width: ringSize, height: ringSize }}
        animate={{
          scale: 0.7 + progress * 0.3,
        }}
        transition={liquidBouncySpring}
      >
        {/* Aurora glow halo — intensifies as user pulls */}
        <motion.div
          className="absolute inset-0 rounded-full blur-xl"
          style={{
            background:
              'conic-gradient(from 0deg, hsl(var(--neon-pink)), hsl(var(--neon-purple)), hsl(var(--neon-cyan)), hsl(var(--primary)), hsl(var(--neon-pink)))',
          }}
          animate={{
            opacity: shouldTrigger || isRefreshing ? 0.85 : 0.25 + progress * 0.5,
            rotate: isRefreshing ? 360 : progress * 270,
          }}
          transition={
            isRefreshing
              ? { rotate: { duration: 2.4, repeat: Infinity, ease: 'linear' }, opacity: { duration: 0.2 } }
              : { duration: 0.15, ease: MOTION_CONFIG.ease.expoOut }
          }
        />

        {/* Spinning conic-gradient ring (the actual aurora swirl) */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'conic-gradient(from 0deg, hsl(var(--neon-pink)), hsl(var(--neon-purple)), hsl(var(--neon-cyan)), hsl(var(--primary)), hsl(var(--neon-yellow)), hsl(var(--neon-pink)))',
            WebkitMask: 'radial-gradient(circle, transparent 55%, #000 57%)',
            mask: 'radial-gradient(circle, transparent 55%, #000 57%)',
          }}
          animate={{ rotate: isRefreshing ? 360 : progress * 360 }}
          transition={
            isRefreshing
              ? { duration: 1.4, repeat: Infinity, ease: 'linear' }
              : { duration: 0.1, ease: 'linear' }
          }
        />

        {/* Inner frosted disc */}
        <div className="absolute inset-[5px] rounded-full bg-card/80 backdrop-blur-md border border-white/10" />

        {/* VYBE 'V' mark */}
        <motion.span
          className="relative z-10 text-base font-black bg-gradient-to-br from-primary via-accent to-primary bg-clip-text text-transparent"
          animate={{
            opacity: shouldTrigger || isRefreshing ? 1 : 0.5 + progress * 0.5,
            scale: isRefreshing ? [1, 1.1, 1] : 1,
          }}
          transition={
            isRefreshing
              ? { scale: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } }
              : { duration: 0.15 }
          }
        >
          V
        </motion.span>
      </motion.div>
    </div>
  );
}

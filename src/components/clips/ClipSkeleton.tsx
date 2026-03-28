import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

/**
 * Premium shimmer skeleton for clips loading state
 * Mimics TikTok's loading experience with pulsing gradient
 */
export function ClipSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("relative w-full h-full bg-black overflow-hidden", className)}>
      {/* Shimmer gradient overlay */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(110deg, transparent 25%, hsl(var(--primary) / 0.08) 37%, hsl(var(--primary) / 0.15) 50%, hsl(var(--primary) / 0.08) 63%, transparent 75%)',
          backgroundSize: '300% 100%',
        }}
        animate={{
          backgroundPosition: ['200% 0', '-200% 0'],
        }}
        transition={{
          duration: 1.8,
          repeat: Infinity,
          ease: 'linear',
        }}
      />

      {/* Fake UI elements */}
      <div className="absolute bottom-20 left-4 right-16 space-y-3">
        {/* Username skeleton */}
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-white/10 animate-pulse" />
          <div className="w-24 h-4 rounded-full bg-white/10 animate-pulse" />
        </div>
        {/* Caption skeleton */}
        <div className="space-y-2">
          <div className="w-3/4 h-3 rounded-full bg-white/8 animate-pulse" />
          <div className="w-1/2 h-3 rounded-full bg-white/8 animate-pulse" />
        </div>
      </div>

      {/* Right side action buttons skeleton */}
      <div className="absolute right-3 bottom-28 space-y-5">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-10 h-10 rounded-full bg-white/10 animate-pulse" />
            <div className="w-6 h-2 rounded-full bg-white/8 animate-pulse" />
          </div>
        ))}
      </div>

      {/* Center loading spinner */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          className="w-10 h-10 border-3 border-white/20 border-t-white/80 rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    </div>
  );
}

/**
 * Grid of clip skeletons for explore/profile pages
 */
export function ClipSkeletonGrid({ count = 9 }: { count?: number }) {
  return (
    <div className="grid grid-cols-3 gap-1">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="aspect-[9/16] relative overflow-hidden rounded-sm bg-muted">
          <motion.div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(110deg, transparent 25%, hsl(var(--muted-foreground) / 0.05) 37%, hsl(var(--muted-foreground) / 0.1) 50%, hsl(var(--muted-foreground) / 0.05) 63%, transparent 75%)',
              backgroundSize: '300% 100%',
            }}
            animate={{
              backgroundPosition: ['200% 0', '-200% 0'],
            }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              ease: 'linear',
              delay: i * 0.1,
            }}
          />
          <div className="absolute bottom-2 left-2 right-2 space-y-1">
            <div className="w-2/3 h-2 rounded-full bg-foreground/10 animate-pulse" />
            <div className="w-1/3 h-2 rounded-full bg-foreground/10 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

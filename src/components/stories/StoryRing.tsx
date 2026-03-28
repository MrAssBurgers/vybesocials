import { memo, useMemo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface StoryRingProps {
  size?: number;
  hasUnviewed: boolean;
  hasStory: boolean;
  isUploading?: boolean;
  children: React.ReactNode;
}

/**
 * Premium animated story ring with gradient rotation for unviewed stories.
 * Uses CSS conic-gradient with framer-motion rotation for a smooth, 
 * Instagram-premium feel.
 */
export const StoryRing = memo(function StoryRing({
  size = 68,
  hasUnviewed,
  hasStory,
  isUploading,
  children,
}: StoryRingProps) {
  const ringSize = size + 6; // 3px padding on each side

  if (!hasStory && !isUploading) {
    return <div style={{ width: size, height: size }}>{children}</div>;
  }

  if (isUploading) {
    return (
      <div className="relative" style={{ width: ringSize, height: ringSize }}>
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))',
            padding: 3,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
        >
          <div className="w-full h-full rounded-full bg-background" />
        </motion.div>
        <div className="absolute inset-[3px]">{children}</div>
      </div>
    );
  }

  if (hasUnviewed) {
    return (
      <div className="relative" style={{ width: ringSize, height: ringSize }}>
        {/* Glow layer */}
        <motion.div
          className="absolute inset-[-2px] rounded-full opacity-40 blur-[4px]"
          style={{
            background: 'conic-gradient(from 0deg, hsl(var(--primary)), hsl(var(--accent)), hsl(280 80% 60%), hsl(var(--primary)))',
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        />
        {/* Ring layer */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, hsl(var(--primary)), hsl(var(--accent)), hsl(280 80% 60%), hsl(var(--primary)))',
            padding: 3,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
        >
          <div className="w-full h-full rounded-full bg-background" />
        </motion.div>
        <div className="absolute inset-[3px]">{children}</div>
      </div>
    );
  }

  // Viewed story — static muted ring
  return (
    <div
      className="rounded-full bg-muted-foreground/30"
      style={{ width: ringSize, height: ringSize, padding: 3 }}
    >
      <div className="w-full h-full rounded-full bg-background relative">
        <div className="absolute inset-0">{children}</div>
      </div>
    </div>
  );
});

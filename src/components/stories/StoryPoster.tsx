import { memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface StoryPosterProps {
  width?: number;
  height?: number;
  borderRadius?: number;
  hasUnviewed: boolean;
  hasStory: boolean;
  isUploading?: boolean;
  posterUrl?: string | null;
  fallbackInitial?: string;
  children?: React.ReactNode;
}

const POSTER_WIDTH = 84;
const POSTER_HEIGHT = 112;
const POSTER_RADIUS = 18;

/**
 * Snapchat-style rounded poster tile for stories (not circular rings).
 */
export const StoryPoster = memo(function StoryPoster({
  width = POSTER_WIDTH,
  height = POSTER_HEIGHT,
  borderRadius = POSTER_RADIUS,
  hasUnviewed,
  hasStory,
  isUploading,
  posterUrl,
  fallbackInitial,
  children,
}: StoryPosterProps) {

  if (isUploading) {
    return (
      <div className="relative flex-shrink-0" style={{ width: width + 4, height: height + 4 }}>
        <motion.div
          className="absolute inset-0"
          style={{
            borderRadius,
            background:
              'conic-gradient(from 0deg, hsl(var(--primary)), hsl(var(--accent)), hsl(var(--primary)))',
            padding: 2,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
        >
          <div className="h-full w-full bg-background" style={{ borderRadius: borderRadius - 2 }} />
        </motion.div>
        <div
          className="absolute inset-[2px] overflow-hidden bg-muted"
          style={{ borderRadius: borderRadius - 2 }}
        >
          {children}
        </div>
      </div>
    );
  }

  if (!hasStory) {
    return (
      <div
        className="relative flex-shrink-0 overflow-hidden border-2 border-dashed border-muted-foreground/35 bg-muted/40"
        style={{ width, height, borderRadius }}
      >
        {children}
      </div>
    );
  }

  const unviewedBorder =
    'linear-gradient(135deg, hsl(48 96% 53%), hsl(var(--accent)), hsl(48 96% 53%))';
  const viewedBorder = 'hsl(var(--muted-foreground) / 0.35)';

  return (
    <div
      className="relative flex-shrink-0"
      style={{
        width: width + (hasUnviewed ? 4 : 2),
        height: height + (hasUnviewed ? 4 : 2),
        padding: hasUnviewed ? 2 : 1,
        borderRadius: borderRadius + 2,
        background: hasUnviewed ? unviewedBorder : viewedBorder,
        boxShadow: hasUnviewed ? '0 0 12px hsl(48 96% 53% / 0.25)' : undefined,
      }}
    >
      <div
        className="relative h-full w-full overflow-hidden bg-black"
        style={{ borderRadius }}
      >
        {posterUrl ? (
          <img
            src={posterUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted text-lg font-semibold text-muted-foreground">
            {fallbackInitial?.charAt(0).toUpperCase() || '?'}
          </div>
        )}
        {children}
      </div>
    </div>
  );
});

export function getStoryPosterDimensions() {
  return { width: POSTER_WIDTH, height: POSTER_HEIGHT, borderRadius: POSTER_RADIUS };
}

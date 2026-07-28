import { memo } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

import { storyRingGradient, storyCoverGradient } from '@/lib/storyThemeRing';

interface StoryPosterProps {
  width?: number;
  height?: number;
  borderRadius?: number;
  hasUnviewed: boolean;
  hasStory: boolean;
  isUploading?: boolean;
  posterUrl?: string | null;
  fallbackInitial?: string;
  /** Uploader's equipped theme — animated ring uses this, not the viewer theme. */
  themeGradient?: string | null;
  priority?: boolean;
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
  themeGradient,
  priority = false,
  children,
}: StoryPosterProps) {

  const imgLoading = priority ? 'eager' : 'lazy';
  const imgDecoding = priority ? 'sync' : 'async';
  const imgFetchPriority = priority ? 'high' : 'auto';
  const ringGradient = storyRingGradient(themeGradient ?? null);
  const coverGradient = storyCoverGradient(themeGradient ?? null);

  if (isUploading) {
    return (
      <div className="relative flex-shrink-0" style={{ width: width + 4, height: height + 4 }}>
        <motion.div
          className="absolute inset-0"
          style={{
            borderRadius,
            background: ringGradient,
            padding: 2,
          }}
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
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

  const unviewedBorder = ringGradient;
  const ringPad = 3;

  if (hasUnviewed) {
    return (
      <div
        className="relative flex-shrink-0"
        style={{ width: width + ringPad * 2, height: height + ringPad * 2 }}
      >
        <div
          className="absolute inset-0"
          style={{
            borderRadius: borderRadius + ringPad,
            background: unviewedBorder,
            padding: ringPad,
          }}
        >
          <div
            className="h-full w-full bg-background"
            style={{ borderRadius: borderRadius + 1 }}
          />
        </div>
        <div
          className="absolute overflow-hidden bg-black"
          style={{
            top: ringPad,
            left: ringPad,
            right: ringPad,
            bottom: ringPad,
            borderRadius,
          }}
        >
          {/* Hide poster until viewed — theme-colored gradient veil (Snapchat-style) */}
          <div
            className="absolute inset-0 z-10"
            style={{ background: coverGradient }}
            aria-hidden
          />
          {posterUrl ? (
            <img
              src={posterUrl}
              alt=""
              className="h-full w-full object-cover scale-110 blur-2xl opacity-20"
              loading={imgLoading}
              decoding={imgDecoding}
              // @ts-expect-error fetchpriority is valid HTML; React types still prefer camelCase
              fetchpriority={imgFetchPriority}
              draggable={false}
            />
          ) : (
            <div
              className="flex h-full w-full items-center justify-center text-lg font-semibold text-white/80"
              style={{ background: coverGradient }}
            >
              {fallbackInitial?.charAt(0).toUpperCase() || '?'}
            </div>
          )}
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex-shrink-0 box-border"
      style={{
        width: width + 4,
        height: height + 4,
        padding: 2,
        borderRadius: borderRadius + 2,
        background: '#000000',
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
            loading={imgLoading}
            decoding={imgDecoding}
            // @ts-expect-error fetchpriority is valid HTML; React types still prefer camelCase
            fetchpriority={imgFetchPriority}
            draggable={false}
          />
        ) : (
          <div
            className="flex h-full w-full items-center justify-center text-lg font-semibold text-white/90"
            style={{ background: coverGradient }}
          >
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

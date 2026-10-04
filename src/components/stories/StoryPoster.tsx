import { memo, useState } from 'react';
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

  const ringGradient = storyRingGradient(themeGradient ?? null);
  const coverGradient = storyCoverGradient(themeGradient ?? null);

  if (isUploading) {
    return (
      <div className="relative flex-shrink-0" style={{ width: width + 4, height: height + 4 }}>
        <div
          className="absolute inset-0 animate-pulse"
          style={{
            borderRadius,
            background: ringGradient,
            padding: 2,
          }}
        >
          <div className="h-full w-full bg-background" style={{ borderRadius: borderRadius - 2 }} />
        </div>
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
        className="relative flex-shrink-0 overflow-hidden border border-foreground/10 bg-muted/40"
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
          <PosterImage key={posterUrl || 'empty'} url={posterUrl} initial={fallbackInitial} background={coverGradient} priority={priority} veiled />
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
        background: 'hsl(var(--foreground) / .08)',
      }}
    >
      <div
        className="relative h-full w-full overflow-hidden bg-card"
        style={{ borderRadius }}
      >
        <PosterImage key={posterUrl || 'empty'} url={posterUrl} initial={fallbackInitial} background={coverGradient} priority={priority} />
        {children}
      </div>
    </div>
  );
});

export function getStoryPosterDimensions() {
  return { width: POSTER_WIDTH, height: POSTER_HEIGHT, borderRadius: POSTER_RADIUS };
}

/** Keep a visible surface until decoding succeeds; a broken URL never becomes an empty tile. */
function PosterImage({ url, initial, background, priority, veiled = false }: {
  url?: string | null; initial?: string; background: string; priority: boolean; veiled?: boolean;
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  return <div className="relative h-full w-full" data-poster-state={!url ? 'empty' : status}>
    <div aria-hidden className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-white/90" style={{ background }}>
      <span className="rounded-full bg-black/15 px-3 py-2 backdrop-blur-sm">{initial?.charAt(0).toUpperCase() || 'V'}</span>
    </div>
    {url && status !== 'failed' && <img src={url} alt="" draggable={false}
      className={cn('relative h-full w-full object-cover transition-opacity duration-300', veiled && 'scale-110 blur-2xl')}
      style={{ opacity: status === 'loaded' ? veiled ? .2 : 1 : 0 }}
      onLoad={event => setStatus(event.currentTarget.naturalWidth > 0 ? 'loaded' : 'failed')}
      onError={() => setStatus('failed')} loading={priority ? 'eager' : 'lazy'} decoding="async"
      // @ts-expect-error fetchpriority is valid HTML; React types still prefer camelCase
      fetchpriority={priority ? 'high' : 'auto'} />}
  </div>;
}

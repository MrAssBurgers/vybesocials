import { forwardRef, memo, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface MediaFallbackProps {
  type?: 'image' | 'video' | 'short';
  caption?: string;
  className?: string;
  /** If true, shows a subtle empty state instead of a prominent placeholder */
  subtle?: boolean;
}

/**
 * Fallback component for failed/missing media
 * Now shows a subtle gradient instead of a broken placeholder icon
 */
export const MediaFallback = memo(forwardRef<HTMLDivElement, MediaFallbackProps>(
  function MediaFallback({ type = 'image', caption, className, subtle = true }, ref) {
    // By default, show a subtle gradient that blends in rather than a broken icon
    if (subtle) {
      return (
        <div 
          ref={ref}
          className={cn(
            "w-full h-full bg-gradient-to-br from-muted/80 via-muted/60 to-muted/40",
            "flex items-end justify-start p-4",
            className
          )}
        >
          {caption && (
            <p className="text-sm text-muted-foreground/80 line-clamp-2 max-w-full">
              ✨ {caption}
            </p>
          )}
        </div>
      );
    }
    
    // Explicit fallback style (only when subtle=false)
    return (
      <div 
        ref={ref}
        className={cn(
          "w-full h-full flex flex-col items-center justify-center bg-muted/30 text-muted-foreground/50",
          className
        )}
      >
        {caption && (
          <p className="text-sm text-center px-4 line-clamp-2 max-w-[200px] mt-2">
            {caption}
          </p>
        )}
      </div>
    );
  }
));

interface MediaSkeletonProps {
  className?: string;
}

export const MediaSkeleton = memo(forwardRef<HTMLDivElement, MediaSkeletonProps>(
  function MediaSkeleton({ className }, ref) {
    return (
      <div 
        ref={ref}
        className={cn(
          "w-full h-full bg-muted/50 relative overflow-hidden",
          className
        )}
      >
        {/* Shimmer effect - better perceived loading */}
        <div 
          className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent"
          style={{ animationDuration: '1.5s' }}
        />
      </div>
    );
  }
));

// Blur placeholder for blur-up loading effect
interface BlurPlaceholderProps {
  src?: string;
  className?: string;
}

export const BlurPlaceholder = memo(function BlurPlaceholder({ src, className }: BlurPlaceholderProps) {
  if (!src) {
    return <MediaSkeleton className={className} />;
  }
  
  return (
    <div className={cn("absolute inset-0 overflow-hidden", className)}>
      <img
        src={src}
        alt=""
        className="w-full h-full object-cover blur-xl scale-110 opacity-50"
        aria-hidden="true"
      />
    </div>
  );
});

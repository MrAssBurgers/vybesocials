import { forwardRef, memo } from 'react';
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
 * Theme-tinted glass gradient — no flat gray slabs
 */
export const MediaFallback = memo(forwardRef<HTMLDivElement, MediaFallbackProps>(
  function MediaFallback({ type = 'image', caption, className, subtle = true }, ref) {
    if (subtle) {
      return (
        <div 
          ref={ref}
          className={cn(
            "w-full h-full bg-gradient-to-br from-primary/8 via-card/55 to-accent/6",
            "backdrop-blur-sm border border-foreground/[0.04]",
            "flex items-end justify-start p-4",
            className
          )}
        >
          {caption && (
            <p className="text-sm text-muted-foreground/80 line-clamp-2 max-w-full">
              {caption}
            </p>
          )}
        </div>
      );
    }
    
    return (
      <div 
        ref={ref}
        className={cn(
          "w-full h-full flex flex-col items-center justify-center",
          "bg-gradient-to-br from-card/70 via-muted/30 to-card/50 backdrop-blur-md",
          "text-muted-foreground/50",
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
          "w-full h-full bg-gradient-to-br from-card/40 via-muted/25 to-card/30 relative overflow-hidden",
          className
        )}
      >
        <div 
          className="absolute inset-0 -translate-x-full media-shimmer bg-gradient-to-r from-transparent via-foreground/[0.06] to-transparent"
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

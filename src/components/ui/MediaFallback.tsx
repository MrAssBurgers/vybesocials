import { forwardRef, memo } from 'react';
import { cn } from '@/lib/utils';
import { ImageIcon, Film } from 'lucide-react';

interface MediaFallbackProps {
  type?: 'image' | 'video' | 'short';
  caption?: string;
  className?: string;
}

export const MediaFallback = memo(forwardRef<HTMLDivElement, MediaFallbackProps>(
  function MediaFallback({ type = 'image', caption, className }, ref) {
    const isVideo = type === 'video' || type === 'short';
    
    return (
      <div 
        ref={ref}
        className={cn(
          "w-full h-full flex flex-col items-center justify-center bg-muted/50 text-muted-foreground",
          className
        )}
      >
        <div className="p-4 rounded-full bg-muted/80 mb-3">
          {isVideo ? (
            <Film className="w-8 h-8 opacity-50" />
          ) : (
            <ImageIcon className="w-8 h-8 opacity-50" />
          )}
        </div>
        {caption && (
          <p className="text-sm text-center px-4 line-clamp-2 max-w-[200px]">
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
          "w-full h-full bg-muted relative overflow-hidden",
          className
        )}
      >
        {/* Shimmer effect - better perceived loading */}
        <div 
          className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent"
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

import { forwardRef } from 'react';
import { cn } from '@/lib/utils';
import { ImageIcon, Film } from 'lucide-react';

interface MediaFallbackProps {
  type?: 'image' | 'video' | 'short';
  caption?: string;
  className?: string;
}

export const MediaFallback = forwardRef<HTMLDivElement, MediaFallbackProps>(
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
);

interface MediaSkeletonProps {
  className?: string;
}

export const MediaSkeleton = forwardRef<HTMLDivElement, MediaSkeletonProps>(
  function MediaSkeleton({ className }, ref) {
    return (
      <div 
        ref={ref}
        className={cn(
          "w-full h-full bg-muted animate-pulse",
          className
        )}
      />
    );
  }
);

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'circular' | 'text' | 'card';
  animate?: boolean;
}

const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(
  function Skeleton({ className, variant = 'default', animate = true, ...props }, ref) {
    const variants = {
      default: 'rounded-md',
      circular: 'rounded-full',
      text: 'rounded h-4',
      card: 'rounded-xl',
    };

    return (
      <div 
        ref={ref}
        className={cn(
          "bg-muted",
          variants[variant],
          animate && "skeleton-shimmer",
          className
        )} 
        {...props} 
      />
    );
  }
);

// Common skeleton patterns
function SkeletonAvatar({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'h-8 w-8',
    md: 'h-10 w-10',
    lg: 'h-16 w-16',
  };
  
  return <Skeleton variant="circular" className={cn(sizes[size], className)} />;
}

function SkeletonText({ lines = 1, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton 
          key={i} 
          variant="text" 
          className={cn("w-full", i === lines - 1 && lines > 1 && "w-3/4")} 
        />
      ))}
    </div>
  );
}

function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border p-4 space-y-3", className)}>
      <div className="flex items-center gap-3">
        <SkeletonAvatar />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
      <SkeletonText lines={2} />
    </div>
  );
}

function SkeletonPost({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center gap-3">
        <SkeletonAvatar />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="aspect-square w-full rounded-lg" />
      <div className="flex gap-4">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
        <Skeleton className="h-6 w-16" />
      </div>
    </div>
  );
}

function SkeletonMessage({ className, isOwn = false }: { className?: string; isOwn?: boolean }) {
  return (
    <div className={cn("flex gap-2", isOwn && "flex-row-reverse", className)}>
      <SkeletonAvatar size="sm" />
      <Skeleton className={cn("h-10 rounded-2xl", isOwn ? "w-32" : "w-48")} />
    </div>
  );
}

function SkeletonStory({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <Skeleton variant="circular" className="h-16 w-16" />
      <Skeleton className="h-3 w-12" />
    </div>
  );
}

function SkeletonStoriesBar({ className }: { className?: string }) {
  return (
    <div className={cn("flex gap-4 overflow-hidden px-4 py-2", className)}>
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonStory key={i} />
      ))}
    </div>
  );
}

export { 
  Skeleton, 
  SkeletonAvatar, 
  SkeletonText, 
  SkeletonCard, 
  SkeletonPost,
  SkeletonMessage,
  SkeletonStory,
  SkeletonStoriesBar
};

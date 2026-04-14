import { Skeleton } from '@/components/ui/skeleton';

export function PostSkeleton() {
  return (
    <div className="liquid-glass-card rounded-2xl overflow-hidden skeleton-shimmer">
      {/* Header - matches PostCard header exactly */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          {/* Story ring + Avatar */}
          <div className="story-ring">
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>

      {/* Media - aspect-square like PostCard */}
      <Skeleton className="aspect-square w-full" />

      {/* Actions - matches PostCard actions */}
      <div className="p-4 space-y-3">
        {/* Action buttons row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-6 w-6 rounded" />
            <Skeleton className="h-6 w-6 rounded" />
          </div>
          <Skeleton className="h-6 w-6 rounded" />
        </div>

        {/* Likes count */}
        <Skeleton className="h-4 w-24" />

        {/* Caption */}
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>

        {/* Tags */}
        <div className="flex gap-2">
          <Skeleton className="h-4 w-12 rounded" />
          <Skeleton className="h-4 w-16 rounded" />
          <Skeleton className="h-4 w-10 rounded" />
        </div>

        {/* Comments link */}
        <Skeleton className="h-4 w-32" />
      </div>
    </div>
  );
}

export function PostSkeletonList({ count = 2 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <PostSkeleton key={i} />
      ))}
    </>
  );
}

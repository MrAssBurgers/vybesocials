import { Skeleton } from '@/components/ui/skeleton';

export function PostSkeleton() {
  return (
    <div className="liquid-glass-card rounded-2xl overflow-hidden skeleton-shimmer">
      {/* Header - matches PostCard header exactly */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className="story-ring">
            <Skeleton className="h-10 w-10 rounded-full" animate={false} />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-28" animate={false} />
            <Skeleton className="h-3 w-16" animate={false} />
          </div>
        </div>
        <Skeleton className="h-8 w-8 rounded-lg" animate={false} />
      </div>

      {/* Media - aspect-square like PostCard */}
      <Skeleton className="aspect-square w-full" animate={false} />

      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-6 w-6 rounded-lg" animate={false} />
            <Skeleton className="h-6 w-6 rounded-lg" animate={false} />
            <Skeleton className="h-6 w-6 rounded-lg" animate={false} />
          </div>
          <Skeleton className="h-6 w-6 rounded-lg" animate={false} />
        </div>

        <Skeleton className="h-4 w-24" animate={false} />

        <div className="space-y-1.5">
          <Skeleton className="h-4 w-full" animate={false} />
          <Skeleton className="h-4 w-3/4" animate={false} />
        </div>

        <div className="flex gap-2">
          <Skeleton className="h-4 w-12 rounded-md" animate={false} />
          <Skeleton className="h-4 w-16 rounded-md" animate={false} />
          <Skeleton className="h-4 w-10 rounded-md" animate={false} />
        </div>

        <Skeleton className="h-4 w-32" animate={false} />
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

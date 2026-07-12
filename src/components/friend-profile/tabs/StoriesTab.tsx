import { memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Circle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface StoriesTabProps {
  profileId: string;
}

export const StoriesTab = memo(function StoriesTab({ profileId }: StoriesTabProps) {
  const { data: stories, isLoading } = useQuery({
    queryKey: ['friend-profile-stories', profileId],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await db
        .from('stories')
        .select('id, media_url, thumbnail_url, created_at, expires_at')
        .eq('author_id', profileId)
        .gt('expires_at', now)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profileId,
    staleTime: 30_000,
  });

  if (isLoading) {
    return <Skeleton className="h-24 w-full rounded-xl" />;
  }

  if (!stories?.length) {
    return <EmptyState icon={<Circle className="h-8 w-8" />} title="No active stories" description="" />;
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {stories.map((story: { id: string; media_url?: string; thumbnail_url?: string | null }) => (
        <div key={story.id} className="shrink-0 w-16 text-center">
          <Avatar className="h-14 w-14 ring-2 ring-primary mx-auto">
            <AvatarImage src={story.thumbnail_url || story.media_url} />
            <AvatarFallback className="bg-primary/20 text-xs">Story</AvatarFallback>
          </Avatar>
        </div>
      ))}
    </div>
  );
});

import { memo } from 'react';
import { useStories } from '@/hooks/useStories';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Circle } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface StoriesTabProps {
  profileId: string;
}

export const StoriesTab = memo(function StoriesTab({ profileId }: StoriesTabProps) {
  const { data: groups, isLoading, isError, refetch } = useStories(profileId);
  const stories = groups.flatMap(group => group.stories);

  if (isError) return <div role="alert" className="space-y-2 text-sm text-muted-foreground">
    <p>Stories could not be loaded.</p>
    <Button variant="outline" size="sm" onClick={() => { void refetch(); }}>Retry stories</Button>
  </div>;

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

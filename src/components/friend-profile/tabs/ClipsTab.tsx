import { PostListReadStatus } from '@/components/posts/PostListReadStatus';
import { memo } from 'react';
import { Link } from 'react-router-dom';
import { usePosts } from '@/hooks/usePosts';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Film } from 'lucide-react';

interface ClipsTabProps {
  profileId: string;
}

export const ClipsTab = memo(function ClipsTab({ profileId }: ClipsTabProps) {
  const postQuery = usePosts('short', profileId);
  const { data: posts, isLoading } = postQuery;

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[9/16] rounded-lg" />
        ))}
      </div>
    );
  }

  const clips = posts || [];

  if (!clips.length && !postQuery.isError && !postQuery.hasNextPage && !postQuery.hasMoreWindow) {
    return <EmptyState icon={<Film className="h-8 w-8" />} title="No clips yet" description="" />;
  }

  return (
    <><PostListReadStatus query={postQuery} /><div className="grid grid-cols-3 gap-1">
      {clips.map((post) => (
        <Link
          key={post.id}
          to={`/clips/${post.id}`}
          className="aspect-[9/16] rounded-lg overflow-hidden bg-muted"
        >
          <img
            src={post.thumbnail_url || post.media_url}
            alt=""
            className="h-full w-full object-cover"
          />
        </Link>
      ))}
    </div></>
  );
});

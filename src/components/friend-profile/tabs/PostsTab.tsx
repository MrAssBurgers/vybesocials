import { memo } from 'react';
import { Link } from 'react-router-dom';
import { usePosts } from '@/hooks/usePosts';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Grid } from 'lucide-react';

interface PostsTabProps {
  profileId: string;
}

export const PostsTab = memo(function PostsTab({ profileId }: PostsTabProps) {
  const { data: posts, isLoading } = usePosts('post', profileId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
  }

  const filtered = (posts || []).filter((p) => p.type === 'post' || p.type === 'image');

  if (!filtered.length) {
    return <EmptyState icon={<Grid className="h-8 w-8" />} title="No posts yet" description="" />;
  }

  return (
    <div className="grid grid-cols-3 gap-1">
      {filtered.map((post) => (
        <Link
          key={post.id}
          to={`/p/${post.id}`}
          className="aspect-square rounded-lg overflow-hidden bg-muted"
        >
          {post.thumbnail_url || post.media_url ? (
            <img
              src={post.thumbnail_url || post.media_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground p-2">
              {post.caption?.slice(0, 40)}
            </div>
          )}
        </Link>
      ))}
    </div>
  );
});

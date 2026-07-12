import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Share2 } from 'lucide-react';
import { useSharedWithFriend } from '@/hooks/useSharedWithFriend';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

interface SharedTabProps {
  otherProfileId: string;
}

function contentPath(type: string, id: string): string {
  if (type === 'clip' || type === 'short' || type === 'video') return `/clips/${id}`;
  if (type === 'post') return `/p/${id}`;
  return `/p/${id}`;
}

export const SharedTab = memo(function SharedTab({ otherProfileId }: SharedTabProps) {
  const { data: items, isLoading } = useSharedWithFriend(otherProfileId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!items?.length) {
    return (
      <EmptyState
        icon={<Share2 className="h-8 w-8" />}
        title="Nothing shared yet"
        description="Posts and clips you share in DMs appear here"
      />
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Link
          key={item.id}
          to={contentPath(item.content_type, item.content_id)}
          className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-card/30 hover:bg-card/50 transition-colors"
        >
          {item.thumbnail_url ? (
            <img
              src={item.thumbnail_url}
              alt=""
              className="h-10 w-10 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-muted shrink-0 flex items-center justify-center">
              <Share2 className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">
              {item.title || `${item.content_type} shared`}
            </p>
            <p className="text-[10px] text-muted-foreground capitalize">{item.content_type}</p>
          </div>
        </Link>
      ))}
    </div>
  );
});

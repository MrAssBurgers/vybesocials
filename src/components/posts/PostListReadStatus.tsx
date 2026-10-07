import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function PostListReadStatus({ query }: { query: { isError: boolean; isLoading?: boolean; isFetching?: boolean; isFetchingNextPage?: boolean;
  hasNextPage?: boolean; refetch: () => Promise<unknown>; fetchNextPage: () => Promise<unknown>;
  hasMoreWindow?: boolean; advanceWindow?: () => Promise<void>; hasPreviousWindow?: boolean; previousWindow?: () => void; restartWindow?: () => void } }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!query.isLoading) { setSlow(false); return; }
    const timer = window.setTimeout(() => setSlow(true), 2000);
    return () => window.clearTimeout(timer);
  }, [query.isLoading]);
  if (query.isError) return <div role="status" className="py-4 text-center text-sm text-muted-foreground">Posts could not be refreshed.
    <Button variant="outline" size="sm" className="ml-2" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry posts</Button>
    {query.hasPreviousWindow && <Button variant="ghost" size="sm" onClick={query.restartWindow}>Back to newest posts</Button>}</div>;
  if (query.isLoading) return <p role="status" className="py-4 text-center text-sm text-muted-foreground">{slow ? 'Still loading posts. If this does not finish, it will stop and you can retry.' : 'Loading posts…'}</p>;
  if (query.hasNextPage || query.hasMoreWindow || query.hasPreviousWindow) return <div className="space-y-2 py-4 text-center">
    {query.hasPreviousWindow && <Button variant="ghost" size="sm" disabled={query.isFetching} onClick={query.previousWindow}>Newer posts</Button>}
    {query.hasNextPage && <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? 'Loading…' : 'Load more posts'}</Button>}
    {query.hasMoreWindow && <><p className="text-xs text-muted-foreground">Continue to older posts to replace this group.</p>
      <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.advanceWindow?.().catch(() => {})}>Continue to older posts</Button></>}
  </div>;
  return null;
}

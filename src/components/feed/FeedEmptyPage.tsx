import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/** A filtered page can be empty while the underlying cursor still has content.
 * Continue only on demand, so a long run of hidden pages cannot spin a fetch loop.
 */
export function FeedEmptyPage({ hasMore, loading, onLoadMore, children }: {
  hasMore?: boolean; loading?: boolean; onLoadMore: () => void; children: ReactNode;
}) {
  if (!hasMore) return <>{children}</>;
  return <div className="px-4 py-10 text-center space-y-3">
    <p className="text-sm text-muted-foreground">No visible posts on this page. More may be available.</p>
    <Button variant="secondary" disabled={loading} onClick={onLoadMore}>{loading ? 'Loading more…' : 'Load more'}</Button>
  </div>;
}

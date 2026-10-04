export function sortComments<T extends { id: string; created_at: string; like_count?: number }>(comments: readonly T[], sort: 'newest' | 'top'): T[] {
  const date = (value: string) => { const time = Date.parse(value); return Number.isFinite(time) ? time : 0; };
  const likes = (value?: number) => Number.isFinite(value) && value! > 0 ? value! : 0;
  return [...comments].sort((a, b) => {
    const byLikes = sort === 'top' ? likes(b.like_count) - likes(a.like_count) : 0;
    return byLikes || date(b.created_at) - date(a.created_at) || a.id.localeCompare(b.id);
  });
}

export function inboxListIsLoading(inbox: {
  showSkeleton?: boolean;
  isLoading?: boolean;
  isFetched?: boolean;
  displayRows?: readonly unknown[];
}): boolean {
  if ((inbox.displayRows?.length ?? 0) > 0) return false;
  if (inbox.showSkeleton) return true;
  return inbox.isLoading === true && inbox.isFetched === false;
}

export function inboxUnreadAnnouncement(count: number, loading: boolean): string {
  if (loading) return 'Loading messages';
  if (count > 0) return `${count} unread ${count === 1 ? 'message' : 'messages'}`;
  return 'No unread messages';
}

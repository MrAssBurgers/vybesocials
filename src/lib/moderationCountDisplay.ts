type CountQuery = { data?: number; isPending: boolean; isError: boolean };
type CountLabel = number | 'Loading' | 'Unavailable';

/** A failed refresh must not present its cached count as a current result. */
export function moderationCountDisplay(query: CountQuery, pendingFlags: number): { reports: CountLabel; pending: CountLabel } {
  if (query.isError) return { reports: 'Unavailable', pending: 'Unavailable' };
  if (query.isPending || query.data === undefined) return { reports: 'Loading', pending: 'Loading' };
  if (!Number.isSafeInteger(query.data) || query.data < 0) return { reports: 'Unavailable', pending: 'Unavailable' };
  const pending = query.data + pendingFlags;
  return { reports: query.data, pending: Number.isSafeInteger(pending) && pending >= 0 ? pending : 'Unavailable' };
}

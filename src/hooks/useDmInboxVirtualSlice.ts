/**
 * Inbox must NEVER use spacer-padding windowing.
 * Virtual-slice padding caused blank middle gaps when row counts / estimates
 * invalidated during refetch or projection attach. Render the full list.
 */
import type { DMInboxRow } from '@/features/dms/dm.types';

/** Kept for import safety; always disabled. */
export const INBOX_VIRTUAL_THRESHOLD = Number.POSITIVE_INFINITY;

export function useDmInboxVirtualSlice(rows: DMInboxRow[], _enabled = false) {
  return {
    visible: rows,
    paddingTop: 0,
    paddingBottom: 0,
    onScroll: undefined as undefined,
    virtualized: false as const,
  };
}

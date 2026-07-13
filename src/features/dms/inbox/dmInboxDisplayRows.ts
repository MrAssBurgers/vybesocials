import type { DMInboxRow } from '@/features/dms/dm.types';

export type InboxListPhase = 'loading' | 'cached' | 'empty';

export interface ResolveInboxDisplayRowsInput {
  rows: DMInboxRow[];
  lastStableRows: DMInboxRow[];
  hasCachedRows: boolean;
  isFetching: boolean;
  isInitialLoad: boolean;
  fetchSettled: boolean;
  /** Projection / secondary source still hydrating — treat shrinks as partial. */
  projectionHydrating?: boolean;
  tabLoading?: boolean;
}

export interface ResolveInboxDisplayRowsResult {
  displayRows: DMInboxRow[];
  showSkeleton: boolean;
  showEmpty: boolean;
  listPhase: InboxListPhase;
  lastStableRows: DMInboxRow[];
  /** True when incoming was rejected as a partial/empty swap. */
  rejectedPartial: boolean;
}

function conversationIdOf(row: DMInboxRow): string | null {
  if (row.type === 'conversation') return row.preview.conversationId;
  if (row.type === 'request') return `request:${row.request.id}`;
  if (row.type === 'nearby_peer') return `nearby:${row.peer.userId}`;
  if (row.type === 'header') return `header:${row.id}`;
  return null;
}

/**
 * Prefer stable geometry during background loads. Never collapse to empty or a
 * strictly shorter partial list while fetching / projection is hydrating.
 */
export function resolveInboxDisplayRows(
  input: ResolveInboxDisplayRowsInput,
): ResolveInboxDisplayRowsResult {
  const {
    rows,
    lastStableRows,
    hasCachedRows,
    isFetching,
    isInitialLoad,
    fetchSettled,
    projectionHydrating = false,
    tabLoading = false,
  } = input;

  const incomingHasRows = rows.length > 0;
  const stableHasRows = lastStableRows.length > 0;
  const guardPartial = isFetching || projectionHydrating;

  let displayRows = rows;
  let rejectedPartial = false;

  if (!incomingHasRows && (stableHasRows || hasCachedRows)) {
    displayRows = lastStableRows;
    rejectedPartial = true;
  } else if (
    guardPartial &&
    stableHasRows &&
    incomingHasRows &&
    rows.length < lastStableRows.length
  ) {
    // Patch incoming previews into stable order instead of shrinking geometry.
    const byId = new Map<string, DMInboxRow>();
    for (const row of rows) {
      const id = conversationIdOf(row);
      if (id) byId.set(id, row);
    }
    displayRows = lastStableRows.map((stable) => {
      const id = conversationIdOf(stable);
      if (!id) return stable;
      return byId.get(id) ?? stable;
    });
    // Append brand-new ids from incoming that were not in stable.
    const stableIds = new Set(
      lastStableRows.map(conversationIdOf).filter((id): id is string => Boolean(id)),
    );
    for (const row of rows) {
      const id = conversationIdOf(row);
      if (id && !stableIds.has(id)) {
        displayRows = [...displayRows, row];
        stableIds.add(id);
      }
    }
    rejectedPartial = true;
  } else if (incomingHasRows) {
    displayRows = rows;
  } else if (stableHasRows) {
    displayRows = lastStableRows;
  }

  const showSkeleton =
    tabLoading ||
    (isInitialLoad && !hasCachedRows && !stableHasRows && !incomingHasRows);

  const showEmpty =
    fetchSettled &&
    !isFetching &&
    !projectionHydrating &&
    !incomingHasRows &&
    !stableHasRows &&
    !hasCachedRows &&
    displayRows.length === 0;

  const listPhase: InboxListPhase =
    displayRows.length > 0
      ? 'cached'
      : showSkeleton
        ? 'loading'
        : showEmpty
          ? 'empty'
          : 'cached';

  const nextStable =
    incomingHasRows && !(guardPartial && rows.length < lastStableRows.length)
      ? rows
      : displayRows.length > 0
        ? displayRows
        : lastStableRows;

  return {
    displayRows,
    showSkeleton: showSkeleton && displayRows.length === 0,
    showEmpty,
    listPhase,
    lastStableRows: nextStable,
    rejectedPartial,
  };
}

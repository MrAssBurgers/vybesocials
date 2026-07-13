const DEBUG_KEY = 'vybe-dm-inbox-debug';

export function isDmInboxDebugEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

export function logDmInboxDebug(label: string, payload: Record<string, unknown>): void {
  if (!isDmInboxDebugEnabled()) return;
  console.debug(`[dm-inbox-debug] ${label}`, payload);
}

/** Log unexpected list geometry resets (blank gaps / remount loops). */
export function logDmInboxGeometryReset(
  reason: string,
  payload: {
    rowCount: number;
    previousRowCount?: number;
    displayRowCount?: number;
    scrollOffset?: number;
    viewportHeight?: number;
    totalSize?: number;
    activeFilter?: string | null;
    querySource?: string;
    isFetching?: boolean;
    projectionHydrating?: boolean;
  },
): void {
  logDmInboxDebug(`geometry-reset:${reason}`, payload);
}

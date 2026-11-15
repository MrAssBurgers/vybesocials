import { useEffect, useRef, useState } from 'react';
import { loadDmInboxProjection, subscribeDmInboxProjection } from '@/lib/dmInboxProjection';
import type { DmInboxEntryDoc } from '@/features/dms/dm.types';
import { isDmInboxProjectionReadEnabled, isDmInboxShadowCompareEnabled } from '@/lib/dmInboxFeatureFlags';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { reportAccountSnapshot } from '@/lib/reportModerationService';

const EMPTY_ENTRIES: DmInboxEntryDoc[] = [];
interface ProjectionState {
  scope: string;
  entries: DmInboxEntryDoc[];
  isLoading: boolean;
  ready: boolean;
  error: Error | null;
}

export function useDmInboxProjection(viewerId?: string | null) {
  const session = useReportAccountSession();
  const enabled = Boolean(viewerId && session.uid)
    && (isDmInboxProjectionReadEnabled(viewerId) || isDmInboxShadowCompareEnabled());
  const scope = JSON.stringify([viewerId, session.uid, session.epoch, enabled]);
  const latestScopeRef = useRef(scope);
  latestScopeRef.current = scope;
  const [state, setState] = useState<ProjectionState>({
    scope, entries: EMPTY_ENTRIES, isLoading: enabled, ready: false, error: null,
  });

  useEffect(() => {
    if (!viewerId || !enabled) return;
    let cancelled = false;
    let receivedStream = false;
    const current = () => {
      const active = reportAccountSnapshot();
      return !cancelled && latestScopeRef.current === scope
        && active.uid === session.uid && active.epoch === session.epoch;
    };
    const commit = (patch: Partial<ProjectionState>) => {
      if (!current()) return;
      setState(previous => ({
        ...(previous.scope === scope ? previous : {
          scope, entries: EMPTY_ENTRIES, isLoading: true, ready: false, error: null,
        }),
        ...patch,
      }));
    };
    const received = (rows: DmInboxEntryDoc[]) => commit({
      entries: rows.filter(row => row.viewer_id === viewerId || row.viewer_id === session.uid),
      isLoading: false, ready: true, error: null,
    });
    commit({ isLoading: true, error: null });
    void loadDmInboxProjection(viewerId)
      .then(rows => { if (!receivedStream) received(rows); })
      .catch(error => { if (!receivedStream) commit({ error: error instanceof Error ? error : new Error(String(error)), isLoading: false }); });
    const unsubscribe = subscribeDmInboxProjection(
      viewerId, rows => { receivedStream = true; received(rows); }, error => commit({ error, isLoading: false }),
    );
    return () => { cancelled = true; unsubscribe(); };
  }, [viewerId, enabled, scope, session.uid, session.epoch]);

  // Suppress the old scope during render, before its effect cleanup runs.
  const visible = enabled && state.scope === scope ? state : undefined;
  return {
    entries: visible?.entries ?? EMPTY_ENTRIES,
    isLoading: enabled && (visible?.isLoading ?? true),
    error: visible?.error ?? null,
    enabled,
    projectionReady: Boolean(visible?.ready && !visible.isLoading),
    projectionReadEnabled: enabled && isDmInboxProjectionReadEnabled(viewerId),
  };
}

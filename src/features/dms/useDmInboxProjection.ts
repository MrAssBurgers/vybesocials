import { useEffect, useRef, useState } from 'react';
import {
  loadDmInboxProjection,
  subscribeDmInboxProjection,
} from '@/lib/dmInboxProjection';
import type { DmInboxEntryDoc } from '@/features/dms/dm.types';
import {
  isDmInboxProjectionReadEnabled,
  isDmInboxShadowCompareEnabled,
} from '@/lib/dmInboxFeatureFlags';

export function useDmInboxProjection(viewerId?: string | null) {
  const [entries, setEntries] = useState<DmInboxEntryDoc[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const staleEntriesRef = useRef<DmInboxEntryDoc[]>([]);
  const enabled =
    Boolean(viewerId) &&
    (isDmInboxProjectionReadEnabled(viewerId) || isDmInboxShadowCompareEnabled());

  useEffect(() => {
    if (!viewerId || !enabled) {
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(staleEntriesRef.current.length === 0);

    void loadDmInboxProjection(viewerId)
      .then((rows) => {
        if (!cancelled && rows.length) {
          staleEntriesRef.current = rows;
          setEntries(rows);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    const unsub = subscribeDmInboxProjection(
      viewerId,
      (rows) => {
        if (!cancelled) {
          if (rows.length) staleEntriesRef.current = rows;
          setEntries(rows.length ? rows : staleEntriesRef.current);
          setIsLoading(false);
          setError(null);
        }
      },
      (err) => {
        if (!cancelled) setError(err);
      },
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [viewerId, enabled]);

  const projectionReady = entries.length > 0 && !isLoading;

  return {
    entries,
    isLoading,
    error,
    enabled,
    projectionReady,
    projectionReadEnabled: isDmInboxProjectionReadEnabled(viewerId),
  };
}

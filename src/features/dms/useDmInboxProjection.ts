import { useEffect, useState } from 'react';
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
  const enabled =
    Boolean(viewerId) &&
    (isDmInboxProjectionReadEnabled(viewerId) || isDmInboxShadowCompareEnabled());

  useEffect(() => {
    if (!viewerId || !enabled) {
      setEntries([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    void loadDmInboxProjection(viewerId)
      .then((rows) => {
        if (!cancelled) {
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
          setEntries(rows);
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

  return {
    entries,
    isLoading,
    error,
    enabled,
    projectionReadEnabled: isDmInboxProjectionReadEnabled(viewerId),
  };
}

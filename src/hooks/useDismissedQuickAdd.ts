import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';

const STORAGE_KEY_PREFIX = 'vybe_dismissed_quick_add_';

function readDismissedFromStorage(key: string): Set<string> {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return new Set();
    const parsed = JSON.parse(stored);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

export function useDismissedQuickAdd() {
  const { profile, user } = useAuth();
  const storageKey = user?.id ? `${STORAGE_KEY_PREFIX}${user.id}` : null;
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() =>
    storageKey ? readDismissedFromStorage(storageKey) : new Set(),
  );

  // Reload when auth user becomes available (earlier than profile hydration).
  useEffect(() => {
    if (!storageKey) return;
    setDismissedIds(readDismissedFromStorage(storageKey));

    db
      .from('user_preferences' as any)
      .select('dismissed_quick_add_ids')
      .eq('user_id', user!.id)
      .maybeSingle()
      .then(({ data }) => {
        const dbIds = (data as any)?.dismissed_quick_add_ids;
        if (!dbIds || !Array.isArray(dbIds) || dbIds.length === 0) return;
        setDismissedIds((prev) => {
          const merged = new Set([...prev, ...dbIds]);
          localStorage.setItem(storageKey, JSON.stringify([...merged]));
          return merged;
        });
      });
  }, [storageKey, user?.id]);

  const persistDismissed = useCallback(
    async (arr: string[]) => {
      if (!storageKey) return;
      localStorage.setItem(storageKey, JSON.stringify(arr));
      if (!user?.id) return;
      try {
        await db
          .from('user_preferences' as any)
          .upsert(
            {
              user_id: user.id,
              dismissed_quick_add_ids: arr,
              updated_at: new Date().toISOString(),
            } as any,
            { onConflict: 'user_id' },
          );
      } catch {
        /* localStorage is source of truth offline */
      }
    },
    [storageKey, user?.id],
  );

  const dismissUser = useCallback(
    (userId: string) => {
      setDismissedIds((prev) => {
        const next = new Set([...prev, userId]);
        void persistDismissed([...next]);
        return next;
      });
    },
    [persistDismissed],
  );

  const isDismissed = useCallback(
    (userId: string) => dismissedIds.has(userId),
    [dismissedIds],
  );

  const clearDismissed = useCallback(() => {
    if (!storageKey) return;
    setDismissedIds(new Set());
    localStorage.removeItem(storageKey);
    void persistDismissed([]);
  }, [storageKey, persistDismissed]);

  return {
    dismissedIds,
    dismissUser,
    isDismissed,
    clearDismissed,
  };
}

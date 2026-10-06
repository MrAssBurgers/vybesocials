import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { profileAccountGuard } from '@/lib/profileAccountGuard';
import { useProfileAccount } from './useProfileAccount';

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
  const account = useProfileAccount();
  const storageKey = user?.id ? `${STORAGE_KEY_PREFIX}${user.id}` : null;
  const [loadedKey, setLoadedKey] = useState(storageKey);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() =>
    storageKey ? readDismissedFromStorage(storageKey) : new Set(),
  );

  // Reload when auth user becomes available (earlier than profile hydration).
  useEffect(() => {
    if (!storageKey) return;
    let active = true;
    let guard: () => void;
    try { guard = profileAccountGuard(user!.id, () => { if (!active) throw new Error('Suggestion preferences retired.'); }); } catch { return; }
    setDismissedIds(readDismissedFromStorage(storageKey));
    setLoadedKey(storageKey);

    db
      .from('user_preferences' as any)
      .select('dismissed_quick_add_ids')
      .eq('user_id', user!.id)
      .maybeSingle()
      .then(({ data }) => {
        try { guard(); } catch { return; }
        const dbIds = (data as any)?.dismissed_quick_add_ids;
        if (!dbIds || !Array.isArray(dbIds) || dbIds.length === 0) return;
        setDismissedIds((prev) => {
          const merged = new Set([...prev, ...dbIds]);
          try { localStorage.setItem(storageKey, JSON.stringify([...merged])); } catch { /* Restricted storage. */ }
          return merged;
        });
      }).catch(() => { /* Keep this account's local dismissals on network failure. */ });
    return () => { active = false; };
  }, [storageKey, user?.id, account.session.epoch]);

  const persistDismissed = useCallback(
    async (arr: string[]) => {
      if (!storageKey) return;
      try { account.guard(); } catch { return; }
      try { localStorage.setItem(storageKey, JSON.stringify(arr)); } catch { /* In-memory dismissal remains. */ }
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
    [storageKey, user?.id, account.session.epoch, account.ready, account.profile?.id],
  );

  const dismissUser = useCallback(
    (userId: string) => {
      try { account.guard(); } catch { return; }
      setDismissedIds((prev) => {
        const next = new Set([...prev, userId]);
        void persistDismissed([...next]);
        return next;
      });
    },
    [persistDismissed, account.session.epoch, account.ready, account.profile?.id],
  );

  const isDismissed = useCallback(
    (userId: string) => loadedKey === storageKey && !!storageKey && dismissedIds.has(userId),
    [dismissedIds, loadedKey, storageKey],
  );

  const clearDismissed = useCallback(() => {
    if (!storageKey) return;
    try { account.guard(); } catch { return; }
    setDismissedIds(new Set());
    try { localStorage.removeItem(storageKey); } catch { /* Restricted storage. */ }
    void persistDismissed([]);
  }, [storageKey, persistDismissed, account.session.epoch, account.ready, account.profile?.id]);

  return {
    dismissedIds,
    dismissUser,
    isDismissed,
    clearDismissed,
  };
}

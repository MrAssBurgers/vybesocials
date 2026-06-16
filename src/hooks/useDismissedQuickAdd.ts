import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';

const STORAGE_KEY_PREFIX = 'vybe_dismissed_quick_add_';

export function useDismissedQuickAdd() {
  const { profile, user } = useAuth();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const storageKey = profile?.id ? `${STORAGE_KEY_PREFIX}${profile.id}` : null;

  // Load from DB first, fallback to localStorage
  useEffect(() => {
    if (!storageKey || !user?.id) return;
    
    // Fast local read
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) setDismissedIds(new Set(JSON.parse(stored)));
    } catch { /* noop */ }

    // Sync from DB
    db
      .from('user_preferences' as any)
      .select('dismissed_quick_add_ids')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        const dbIds = (data as any)?.dismissed_quick_add_ids;
        if (dbIds && Array.isArray(dbIds) && dbIds.length > 0) {
          setDismissedIds(prev => {
            const merged = new Set([...prev, ...dbIds]);
            localStorage.setItem(storageKey!, JSON.stringify([...merged]));
            return merged;
          });
        }
      });
  }, [storageKey, user?.id]);

  // Dismiss a user permanently
  const dismissUser = useCallback((userId: string) => {
    if (!storageKey) return;
    
    setDismissedIds(prev => {
      const next = new Set([...prev, userId]);
      const arr = [...next];
      localStorage.setItem(storageKey, JSON.stringify(arr));

      // Persist to DB (fire-and-forget)
      if (user?.id) {
        db
          .from('user_preferences' as any)
          .upsert({
            user_id: user.id,
            dismissed_quick_add_ids: arr,
            updated_at: new Date().toISOString(),
          } as any, { onConflict: 'user_id' })
          .then(() => {});
      }

      return next;
    });
  }, [storageKey, user?.id]);

  // Check if user is dismissed
  const isDismissed = useCallback((userId: string) => {
    return dismissedIds.has(userId);
  }, [dismissedIds]);

  // Clear all dismissed
  const clearDismissed = useCallback(() => {
    if (!storageKey) return;
    setDismissedIds(new Set());
    localStorage.removeItem(storageKey);

    if (user?.id) {
      db
        .from('user_preferences' as any)
        .upsert({
          user_id: user.id,
          dismissed_quick_add_ids: [],
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'user_id' })
        .then(() => {});
    }
  }, [storageKey, user?.id]);

  return {
    dismissedIds,
    dismissUser,
    isDismissed,
    clearDismissed,
  };
}

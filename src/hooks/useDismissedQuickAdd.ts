import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth';

const STORAGE_KEY_PREFIX = 'vybe_dismissed_quick_add_';

export function useDismissedQuickAdd() {
  const { profile } = useAuth();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());

  const storageKey = profile?.id ? `${STORAGE_KEY_PREFIX}${profile.id}` : null;

  // Load from localStorage on mount
  useEffect(() => {
    if (!storageKey) return;
    
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        setDismissedIds(new Set(parsed));
      }
    } catch (error) {
      console.error('[DismissedQuickAdd] Failed to load:', error);
    }
  }, [storageKey]);

  // Dismiss a user permanently
  const dismissUser = useCallback((userId: string) => {
    if (!storageKey) return;
    
    setDismissedIds(prev => {
      const next = new Set([...prev, userId]);
      localStorage.setItem(storageKey, JSON.stringify([...next]));
      return next;
    });
  }, [storageKey]);

  // Check if user is dismissed
  const isDismissed = useCallback((userId: string) => {
    return dismissedIds.has(userId);
  }, [dismissedIds]);

  // Clear all dismissed (for debugging)
  const clearDismissed = useCallback(() => {
    if (!storageKey) return;
    setDismissedIds(new Set());
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  return {
    dismissedIds,
    dismissUser,
    isDismissed,
    clearDismissed,
  };
}

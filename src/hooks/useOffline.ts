import { useState, useEffect, useCallback } from 'react';

const CACHE_PREFIX = 'vybe_offline_';
const DRAFTS_KEY = `${CACHE_PREFIX}drafts`;
const FEED_CACHE_KEY = `${CACHE_PREFIX}feed`;

interface Draft {
  id: string;
  type: 'post' | 'message' | 'comment';
  content: string;
  metadata?: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

interface CachedFeed {
  posts: any[];
  cachedAt: number;
  expiresAt: number;
}

// Drafts management
export function useOfflineDrafts() {
  const [drafts, setDrafts] = useState<Draft[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(DRAFTS_KEY);
    if (stored) {
      try {
        setDrafts(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse drafts:', e);
      }
    }
  }, []);

  const saveDraft = useCallback((draft: Omit<Draft, 'id' | 'createdAt' | 'updatedAt'>) => {
    const newDraft: Draft = {
      ...draft,
      id: `draft_${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    setDrafts(prev => {
      const updated = [...prev, newDraft];
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(updated));
      return updated;
    });

    return newDraft.id;
  }, []);

  const updateDraft = useCallback((id: string, content: string, metadata?: Record<string, any>) => {
    setDrafts(prev => {
      const updated = prev.map(draft => 
        draft.id === id 
          ? { ...draft, content, metadata: { ...draft.metadata, ...metadata }, updatedAt: Date.now() }
          : draft
      );
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const deleteDraft = useCallback((id: string) => {
    setDrafts(prev => {
      const updated = prev.filter(draft => draft.id !== id);
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const getDraft = useCallback((id: string) => {
    return drafts.find(draft => draft.id === id);
  }, [drafts]);

  const clearAllDrafts = useCallback(() => {
    localStorage.removeItem(DRAFTS_KEY);
    setDrafts([]);
  }, []);

  return {
    drafts,
    saveDraft,
    updateDraft,
    deleteDraft,
    getDraft,
    clearAllDrafts,
  };
}

// Feed caching
export function useCachedFeed(feedKey: string = 'home') {
  const cacheKey = `${FEED_CACHE_KEY}_${feedKey}`;

  const getCachedFeed = useCallback((): CachedFeed | null => {
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;

    try {
      const data = JSON.parse(cached) as CachedFeed;
      // Check if expired (default 1 hour)
      if (Date.now() > data.expiresAt) {
        localStorage.removeItem(cacheKey);
        return null;
      }
      return data;
    } catch {
      return null;
    }
  }, [cacheKey]);

  const cacheFeed = useCallback((posts: any[], expiryMs = 3600000) => {
    const cache: CachedFeed = {
      posts,
      cachedAt: Date.now(),
      expiresAt: Date.now() + expiryMs,
    };
    localStorage.setItem(cacheKey, JSON.stringify(cache));
  }, [cacheKey]);

  const clearCache = useCallback(() => {
    localStorage.removeItem(cacheKey);
  }, [cacheKey]);

  return {
    getCachedFeed,
    cacheFeed,
    clearCache,
  };
}

// Offline queue for actions
interface QueuedAction {
  id: string;
  type: 'like' | 'comment' | 'follow' | 'message';
  payload: Record<string, any>;
  createdAt: number;
  retries: number;
}

const QUEUE_KEY = `${CACHE_PREFIX}action_queue`;

export function useOfflineQueue() {
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(QUEUE_KEY);
    if (stored) {
      try {
        setQueue(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse offline queue:', e);
      }
    }
  }, []);

  const addToQueue = useCallback((action: Omit<QueuedAction, 'id' | 'createdAt' | 'retries'>) => {
    const newAction: QueuedAction = {
      ...action,
      id: `action_${Date.now()}`,
      createdAt: Date.now(),
      retries: 0,
    };

    setQueue(prev => {
      const updated = [...prev, newAction];
      localStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
      return updated;
    });

    return newAction.id;
  }, []);

  const removeFromQueue = useCallback((id: string) => {
    setQueue(prev => {
      const updated = prev.filter(action => action.id !== id);
      localStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const processQueue = useCallback(async (processor: (action: QueuedAction) => Promise<boolean>) => {
    if (isProcessing || queue.length === 0) return;

    setIsProcessing(true);

    for (const action of queue) {
      try {
        const success = await processor(action);
        if (success) {
          removeFromQueue(action.id);
        } else {
          // Increment retry count
          setQueue(prev => {
            const updated = prev.map(a => 
              a.id === action.id ? { ...a, retries: a.retries + 1 } : a
            );
            localStorage.setItem(QUEUE_KEY, JSON.stringify(updated));
            return updated;
          });
        }
      } catch (e) {
        console.error('Failed to process queued action:', e);
      }
    }

    setIsProcessing(false);
  }, [isProcessing, queue, removeFromQueue]);

  const clearQueue = useCallback(() => {
    localStorage.removeItem(QUEUE_KEY);
    setQueue([]);
  }, []);

  return {
    queue,
    addToQueue,
    removeFromQueue,
    processQueue,
    clearQueue,
    isProcessing,
    pendingCount: queue.length,
  };
}

// Hook to detect when back online and sync
export function useOfflineSync(onSync: () => Promise<void>) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);

  useEffect(() => {
    const handleOnline = async () => {
      setIsSyncing(true);
      try {
        await onSync();
        setLastSyncedAt(Date.now());
      } catch (e) {
        console.error('Sync failed:', e);
      } finally {
        setIsSyncing(false);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [onSync]);

  return { isSyncing, lastSyncedAt };
}

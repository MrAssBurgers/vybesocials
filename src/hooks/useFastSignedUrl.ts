/**
 * Ultra-fast signed URL hook
 * Returns cached URL instantly, triggers background fetch if needed
 * Optimized to reduce re-renders and network calls
 */

import { useState, useEffect, useSyncExternalStore, useRef, useMemo } from 'react';
import { getCachedSignedUrl, getSignedUrl, needsSigning, batchSignUrls, cacheSignedUrl } from '@/lib/signedUrlCache';
import { firebaseStorageNeedsToken, normalizeMediaUrl } from '@/lib/mediaUrl';
import { firebaseStorage } from '@/lib/firebase/storageService';

function resolveUrlSync(
  normalizedUrl: string | null,
  _needsFirebaseToken: boolean,
): string | null {
  if (!normalizedUrl) return null;
  const cached = getCachedSignedUrl(normalizedUrl);
  if (cached) return cached;
  if (!needsSigning(normalizedUrl) && !_needsFirebaseToken) return normalizedUrl;
  return null;
}

// Subscribers for reactive updates when cache changes
const subscribers = new Set<() => void>();
let version = 0;

function notifySubscribers() {
  version++;
  subscribers.forEach(cb => cb());
}

function subscribe(callback: () => void) {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

/** Share in-flight Firebase resolves so Strict Mode / effect cancel still populate cache. */
const firebaseResolveInflight = new Map<string, Promise<string>>();

function resolveFirebaseUrlShared(normalizedUrl: string): Promise<string> {
  const existing = firebaseResolveInflight.get(normalizedUrl);
  if (existing) return existing;

  const promise = firebaseStorage
    .resolveMediaUrl(normalizedUrl)
    .then((url) => {
      firebaseResolveInflight.delete(normalizedUrl);
      if (url && (url !== normalizedUrl || /[?&]token=/.test(url))) {
        cacheSignedUrl(normalizedUrl, url);
        notifySubscribers();
      }
      return url;
    })
    .catch((err) => {
      firebaseResolveInflight.delete(normalizedUrl);
      throw err;
    });

  firebaseResolveInflight.set(normalizedUrl, promise);
  return promise;
}

/**
 * Fast signed URL hook - returns instantly from cache
 * Falls back to async fetch if not cached
 */
export function useFastSignedUrl(publicUrl: string | null | undefined): string | null {
  const normalizedUrl = normalizeMediaUrl(publicUrl);
  const needsFirebaseToken = firebaseStorageNeedsToken(normalizedUrl);
  const cached = useSyncExternalStore(
    subscribe,
    () => getCachedSignedUrl(normalizedUrl),
    () => getCachedSignedUrl(normalizedUrl)
  );
  const syncCached = cached ?? null;
  
  const [asyncUrl, setAsyncUrl] = useState<string | null>(() =>
    resolveUrlSync(normalizedUrl ?? null, needsFirebaseToken),
  );
  const fetchedRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (!normalizedUrl) {
      setAsyncUrl(null);
      fetchedRef.current = null;
      return;
    }

    if (needsFirebaseToken) {
      if (syncCached) {
        setAsyncUrl(syncCached);
        return;
      }
      let cancelled = false;
      void resolveFirebaseUrlShared(normalizedUrl)
        .then((url) => {
          // Cache already updated in shared resolver; apply locally if still mounted.
          if (cancelled || !url) return;
          setAsyncUrl(url);
        })
        .catch(() => {});
      return () => { cancelled = true; };
    }
    
    if (!needsSigning(normalizedUrl)) {
      setAsyncUrl(normalizedUrl);
      return;
    }
    
    if (syncCached) {
      setAsyncUrl(syncCached);
      return;
    }

    if (fetchedRef.current === normalizedUrl) {
      return;
    }
    
    fetchedRef.current = normalizedUrl;
    let cancelled = false;
    
    getSignedUrl(normalizedUrl).then(url => {
      if (cancelled) {
        // Allow remount/retry after a discarded result
        if (fetchedRef.current === normalizedUrl) fetchedRef.current = null;
        return;
      }
      if (url && url !== normalizedUrl) {
        setAsyncUrl(url);
      }
      notifySubscribers();
    }).catch(() => {
      if (fetchedRef.current === normalizedUrl) fetchedRef.current = null;
      if (!cancelled) notifySubscribers();
    });
    
    return () => {
      cancelled = true;
      if (fetchedRef.current === normalizedUrl) fetchedRef.current = null;
    };
  }, [normalizedUrl, syncCached, needsFirebaseToken]);
  
  return syncCached || asyncUrl || resolveUrlSync(normalizedUrl ?? null, needsFirebaseToken);
}

/**
 * Fast signed URLs for multiple URLs
 */
export function useFastSignedUrls(urls: (string | null | undefined)[]): (string | null)[] {
  // Stable key to prevent unnecessary re-runs
  const urlsKey = useMemo(() => urls.filter(Boolean).join(','), [urls]);
  const [signedUrls, setSignedUrls] = useState<(string | null)[]>([]);
  const processedRef = useRef<string>('');
  
  useEffect(() => {
    // Skip if we've already processed this exact set
    if (processedRef.current === urlsKey) return;
    processedRef.current = urlsKey;
    
    // First pass: get all cached immediately
    const results: (string | null)[] = urls.map(url => {
      const normalized = normalizeMediaUrl(url);
      if (!normalized) return null;
      if (!needsSigning(normalized) && !firebaseStorageNeedsToken(normalized)) return normalized;
      return getCachedSignedUrl(normalized);
    });
    
    setSignedUrls(results);
    
    // Find uncached URLs (deduplicated)
    const uncached = new Set<string>();
    urls.forEach((url, i) => {
      const normalized = normalizeMediaUrl(url);
      if (!normalized || results[i]) return;
      if (needsSigning(normalized) || firebaseStorageNeedsToken(normalized)) {
        uncached.add(normalized);
      }
    });
    
    if (uncached.size === 0) return;
    
    // Batch sign all uncached at once (much faster than individual calls)
    let cancelled = false;
    batchSignUrls([...uncached]).then(() => {
      if (cancelled) return;
      
      // Re-read from cache after batch sign
      const updated = urls.map(url => {
        const normalized = normalizeMediaUrl(url);
        if (!normalized) return null;
        if (!needsSigning(normalized) && !firebaseStorageNeedsToken(normalized)) return normalized;
        return getCachedSignedUrl(normalized) || normalized;
      });
      
      setSignedUrls(updated);
      notifySubscribers();
    }).catch(() => {});
    
    return () => { cancelled = true; };
  }, [urlsKey, urls]);
  
  return signedUrls;
}

/**
 * Preload hook - preloads URLs in background using efficient batch API
 */
export function usePreloadUrls(urls: (string | null | undefined)[]) {
  const urlsKey = useMemo(() => urls.filter(Boolean).join(','), [urls]);
  const preloadedRef = useRef<string>('');
  
  useEffect(() => {
    if (preloadedRef.current === urlsKey) return;
    preloadedRef.current = urlsKey;
    
    const toPreload = urls.filter(u => {
      const normalized = normalizeMediaUrl(u);
      return normalized && needsSigning(normalized) && !getCachedSignedUrl(normalized);
    });
    if (toPreload.length === 0) return;
    
    // Use batch API instead of individual calls
    batchSignUrls(toPreload).then(() => {
      notifySubscribers();
    }).catch(() => {});
  }, [urlsKey, urls]);
}

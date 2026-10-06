/**
 * Ultra-fast signed URL hook
 * Returns cached URL instantly, triggers background fetch if needed
 * Optimized to reduce re-renders and network calls
 */

import { useState, useEffect, useSyncExternalStore, useRef, useMemo, useReducer, useCallback } from 'react';
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

  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = Promise.race([
    firebaseStorage.resolveMediaUrl(normalizedUrl),
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Media connection timed out.')), 10_000); }),
  ])
    .then((url) => {
      // Storage returns the original URL when resolution fails. A tokenless
      // URL is not a usable download and must remain retryable.
      if (!url || firebaseStorageNeedsToken(url)) throw new Error('Media could not be loaded.');
      if (url && (url !== normalizedUrl || /[?&]token=/.test(url))) {
        cacheSignedUrl(normalizedUrl, url);
        notifySubscribers();
      }
      return url;
    })
    .finally(() => {
      clearTimeout(timer);
      if (firebaseResolveInflight.get(normalizedUrl) === promise) firebaseResolveInflight.delete(normalizedUrl);
    });

  firebaseResolveInflight.set(normalizedUrl, promise);
  return promise;
}

/**
 * Fast signed URL hook - returns instantly from cache
 * Falls back to async fetch if not cached
 */
export function useFastSignedUrl(publicUrl: string | null | undefined): string | null {
  return useResolvedMediaUrl(publicUrl).url;
}

/** Bounded resolution with an explicit retry for cards whose URL never loaded. */
export function useResolvedMediaUrl(publicUrl: string | null | undefined, enabled = true) {
  const normalizedUrl = normalizeMediaUrl(publicUrl);
  const needsFirebaseToken = firebaseStorageNeedsToken(normalizedUrl);
  const cached = useSyncExternalStore(
    subscribe,
    () => getCachedSignedUrl(normalizedUrl),
    () => getCachedSignedUrl(normalizedUrl)
  );
  const syncCached = cached ?? null;
  
  const [revision, restart] = useReducer((value: number) => value + 1, 0);
  const retry = useCallback(() => restart(), []);
  const [result, setResult] = useState<{ source: string; revision: number; url: string | null; error: boolean } | null>(null);
  const immediate = syncCached || resolveUrlSync(normalizedUrl, needsFirebaseToken);
  const current = result?.source === normalizedUrl && result.revision === revision ? result : null;
  const url = immediate || current?.url || null;
  
  useEffect(() => {
    if (!enabled || !normalizedUrl || immediate || document.visibilityState === 'hidden' || navigator.onLine === false) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const resolve = async (attempt: number) => {
      try {
        const resolved = await (needsFirebaseToken ? resolveFirebaseUrlShared(normalizedUrl) : getSignedUrl(normalizedUrl));
        if (!resolved) throw new Error('Media could not be loaded.');
        if (!cancelled) setResult({ source: normalizedUrl, revision, url: resolved, error: false });
      } catch {
        if (cancelled) return;
        if (attempt === 0 && document.visibilityState !== 'hidden' && navigator.onLine !== false) {
          timer = setTimeout(() => {
            if (!cancelled && document.visibilityState !== 'hidden' && navigator.onLine !== false) void resolve(1);
          }, 2000);
        } else setResult({ source: normalizedUrl, revision, url: null, error: true });
      }
    };
    void resolve(0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [normalizedUrl, immediate, needsFirebaseToken, revision, enabled]);

  useEffect(() => {
    if (!enabled || !normalizedUrl || url) return;
    const resume = () => { if (document.visibilityState !== 'hidden' && navigator.onLine !== false) retry(); };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => { window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume); };
  }, [enabled, normalizedUrl, url, retry]);
  
  return { url, error: enabled && !url && (!!publicUrl && !normalizedUrl || !!current?.error), retry };
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

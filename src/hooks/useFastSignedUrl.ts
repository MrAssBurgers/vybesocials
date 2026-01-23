/**
 * Ultra-fast signed URL hook
 * Returns cached URL instantly, triggers background fetch if needed
 * Optimized to reduce re-renders and network calls
 */

import { useState, useEffect, useSyncExternalStore, useRef, useMemo } from 'react';
import { getCachedSignedUrl, getSignedUrl, needsSigning, batchSignUrls } from '@/lib/signedUrlCache';

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

/**
 * Fast signed URL hook - returns instantly from cache
 * Falls back to async fetch if not cached
 */
export function useFastSignedUrl(publicUrl: string | null | undefined): string | null {
  // Try cache first (synchronous) - this enables instant display
  const cached = useSyncExternalStore(
    subscribe,
    () => getCachedSignedUrl(publicUrl),
    () => getCachedSignedUrl(publicUrl)
  );
  
  const [asyncUrl, setAsyncUrl] = useState<string | null>(null);
  const fetchedRef = useRef<string | null>(null);
  
  useEffect(() => {
    if (!publicUrl) {
      setAsyncUrl(null);
      return;
    }
    
    // If not a storage URL, use directly
    if (!needsSigning(publicUrl)) {
      setAsyncUrl(publicUrl);
      return;
    }
    
    // If already cached or we already fetched this URL, skip
    if (cached || fetchedRef.current === publicUrl) {
      return;
    }
    
    // Fetch async
    fetchedRef.current = publicUrl;
    let cancelled = false;
    
    getSignedUrl(publicUrl).then(url => {
      if (!cancelled && url) {
        setAsyncUrl(url);
        notifySubscribers();
      }
    }).catch(() => {
      // Silent fail - will show original URL
    });
    
    return () => { cancelled = true; };
  }, [publicUrl, cached]);
  
  // Return cached first, then async result
  return cached || asyncUrl;
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
      if (!url) return null;
      if (!needsSigning(url)) return url;
      return getCachedSignedUrl(url);
    });
    
    setSignedUrls(results);
    
    // Find uncached URLs (deduplicated)
    const uncached = new Set<string>();
    urls.forEach((url, i) => {
      if (url && needsSigning(url) && !results[i]) {
        uncached.add(url);
      }
    });
    
    if (uncached.size === 0) return;
    
    // Batch sign all uncached at once (much faster than individual calls)
    let cancelled = false;
    batchSignUrls([...uncached]).then(() => {
      if (cancelled) return;
      
      // Re-read from cache after batch sign
      const updated = urls.map(url => {
        if (!url) return null;
        if (!needsSigning(url)) return url;
        return getCachedSignedUrl(url) || url;
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
    
    const toPreload = urls.filter(u => u && needsSigning(u) && !getCachedSignedUrl(u));
    if (toPreload.length === 0) return;
    
    // Use batch API instead of individual calls
    batchSignUrls(toPreload).then(() => {
      notifySubscribers();
    }).catch(() => {});
  }, [urlsKey, urls]);
}

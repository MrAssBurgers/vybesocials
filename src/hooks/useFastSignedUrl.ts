/**
 * Ultra-fast signed URL hook
 * Returns cached URL instantly, triggers background fetch if needed
 */

import { useState, useEffect, useSyncExternalStore, useCallback } from 'react';
import { getCachedSignedUrl, getSignedUrl, needsSigning } from '@/lib/signedUrlCache';

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

function getVersion() {
  return version;
}

/**
 * Fast signed URL hook - returns instantly from cache
 * Falls back to async fetch if not cached
 */
export function useFastSignedUrl(publicUrl: string | null | undefined): string | null {
  // Try cache first (synchronous)
  const cached = useSyncExternalStore(
    subscribe,
    () => getCachedSignedUrl(publicUrl),
    () => getCachedSignedUrl(publicUrl)
  );
  
  const [asyncUrl, setAsyncUrl] = useState<string | null>(null);
  
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
    
    // If already cached, we're good
    if (cached) {
      setAsyncUrl(null);
      return;
    }
    
    // Fetch async
    let cancelled = false;
    getSignedUrl(publicUrl).then(url => {
      if (!cancelled && url) {
        setAsyncUrl(url);
        notifySubscribers(); // Notify other components
      }
    });
    
    return () => { cancelled = true; };
  }, [publicUrl, cached]);
  
  // Return cached first, then async result, then null
  return cached || asyncUrl;
}

/**
 * Fast signed URLs for multiple URLs
 */
export function useFastSignedUrls(urls: (string | null | undefined)[]): (string | null)[] {
  const [signedUrls, setSignedUrls] = useState<(string | null)[]>([]);
  
  useEffect(() => {
    // First pass: get all cached
    const results: (string | null)[] = urls.map(url => {
      if (!url) return null;
      if (!needsSigning(url)) return url;
      return getCachedSignedUrl(url);
    });
    
    setSignedUrls(results);
    
    // Second pass: fetch uncached
    const uncachedIndices: number[] = [];
    urls.forEach((url, i) => {
      if (url && needsSigning(url) && !results[i]) {
        uncachedIndices.push(i);
      }
    });
    
    if (uncachedIndices.length === 0) return;
    
    let cancelled = false;
    Promise.all(
      uncachedIndices.map(async i => {
        const signed = await getSignedUrl(urls[i]!);
        return { index: i, signed };
      })
    ).then(fetched => {
      if (cancelled) return;
      
      setSignedUrls(prev => {
        const next = [...prev];
        fetched.forEach(({ index, signed }) => {
          next[index] = signed;
        });
        return next;
      });
      
      notifySubscribers();
    });
    
    return () => { cancelled = true; };
  }, [JSON.stringify(urls)]);
  
  return signedUrls;
}

/**
 * Preload hook - preloads URLs in background
 */
export function usePreloadUrls(urls: (string | null | undefined)[]) {
  useEffect(() => {
    const toPreload = urls.filter(u => u && needsSigning(u) && !getCachedSignedUrl(u));
    if (toPreload.length === 0) return;
    
    // Batch preload
    Promise.all(toPreload.map(u => getSignedUrl(u!))).then(() => {
      notifySubscribers();
    });
  }, [JSON.stringify(urls)]);
}

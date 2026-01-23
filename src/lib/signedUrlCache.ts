/**
 * Ultra-fast Signed URL Cache
 * Pre-warms cache during app startup for instant image loading
 */

import { supabase } from '@/integrations/supabase/client';

interface CacheEntry {
  signedUrl: string;
  expiresAt: number;
}

// Global in-memory cache
const cache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<string | null>>();

// Cache for 50 minutes (before 1 hour expiry)
const CACHE_DURATION = 50 * 60 * 1000;

/**
 * Parse storage URL to get bucket and path
 */
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url) return null;
  
  const publicMatch = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (publicMatch) {
    return { bucket: publicMatch[1], path: publicMatch[2] };
  }
  
  const signedMatch = url.match(/\/storage\/v1\/object\/sign\/([^/]+)\/([^?]+)/);
  if (signedMatch) {
    return { bucket: signedMatch[1], path: signedMatch[2] };
  }
  
  return null;
}

/**
 * Check if URL needs signing (is a Supabase storage URL)
 */
export function needsSigning(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes('/storage/v1/object/public/') || url.includes('/storage/v1/object/sign/');
}

/**
 * Get cached signed URL synchronously - returns null if not cached
 */
export function getCachedSignedUrl(publicUrl: string | null | undefined): string | null {
  if (!publicUrl) return null;
  
  // Not a storage URL - return as-is
  if (!needsSigning(publicUrl)) return publicUrl;
  
  const entry = cache.get(publicUrl);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.signedUrl;
  }
  
  return null;
}

/**
 * Get or create signed URL (async with deduplication)
 */
export async function getSignedUrl(publicUrl: string): Promise<string | null> {
  if (!publicUrl) return null;
  
  // Not a storage URL - return as-is
  if (!needsSigning(publicUrl)) return publicUrl;
  
  // Check cache
  const cached = getCachedSignedUrl(publicUrl);
  if (cached) return cached;
  
  // Check if already fetching
  const pending = pendingRequests.get(publicUrl);
  if (pending) return pending;
  
  // Create new request
  const request = (async () => {
    try {
      const parsed = parseStorageUrl(publicUrl);
      if (!parsed) return publicUrl;
      
      const { data, error } = await supabase.storage
        .from(parsed.bucket)
        .createSignedUrl(parsed.path, 3600);
      
      if (error || !data?.signedUrl) {
        return publicUrl; // Fallback to original
      }
      
      // Cache the result
      cache.set(publicUrl, {
        signedUrl: data.signedUrl,
        expiresAt: Date.now() + CACHE_DURATION,
      });
      
      return data.signedUrl;
    } catch {
      return publicUrl;
    } finally {
      pendingRequests.delete(publicUrl);
    }
  })();
  
  pendingRequests.set(publicUrl, request);
  return request;
}

/**
 * Batch sign multiple URLs at once - MUCH faster than individual calls
 * Deduplicates URLs to prevent redundant network requests
 */
export async function batchSignUrls(urls: (string | null | undefined)[]): Promise<void> {
  // Deduplicate URLs first using Set
  const uniqueUrls = [...new Set(urls.filter(Boolean) as string[])];
  const urlsToSign: { url: string; bucket: string; path: string }[] = [];
  
  for (const url of uniqueUrls) {
    if (!needsSigning(url)) continue;
    if (getCachedSignedUrl(url)) continue; // Already cached
    if (pendingRequests.has(url)) continue; // Already fetching
    
    const parsed = parseStorageUrl(url);
    if (parsed) {
      urlsToSign.push({ url, ...parsed });
    }
  }
  
  if (urlsToSign.length === 0) return;
  
  // Group by bucket for efficient batch requests, dedupe paths within bucket
  const byBucket = new Map<string, Map<string, string>>(); // bucket -> path -> originalUrl
  for (const item of urlsToSign) {
    let bucketMap = byBucket.get(item.bucket);
    if (!bucketMap) {
      bucketMap = new Map();
      byBucket.set(item.bucket, bucketMap);
    }
    // Only keep first occurrence of each path
    if (!bucketMap.has(item.path)) {
      bucketMap.set(item.path, item.url);
    }
  }
  
  // Sign all URLs in parallel by bucket
  const promises = Array.from(byBucket.entries()).map(async ([bucket, pathMap]) => {
    try {
      const paths = Array.from(pathMap.keys());
      const urls = Array.from(pathMap.values());
      
      const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(paths, 3600);
      
      if (error || !data) return;
      
      // Cache all results
      const now = Date.now();
      for (let i = 0; i < paths.length; i++) {
        const signedUrl = data[i]?.signedUrl;
        if (signedUrl) {
          cache.set(urls[i], {
            signedUrl,
            expiresAt: now + CACHE_DURATION,
          });
        }
      }
    } catch (e) {
      // Silent fail - URLs will fallback to original
    }
  });
  
  await Promise.all(promises);
}

/**
 * Preload URLs for instant display
 * Call this during app initialization with known URLs
 */
export async function preloadSignedUrls(urls: (string | null | undefined)[]): Promise<void> {
  await batchSignUrls(urls);
}

/**
 * Get cache stats for debugging
 */
export function getCacheStats() {
  const now = Date.now();
  let valid = 0;
  let expired = 0;
  
  cache.forEach(entry => {
    if (entry.expiresAt > now) valid++;
    else expired++;
  });
  
  return { total: cache.size, valid, expired, pending: pendingRequests.size };
}

/**
 * Clear the cache (for logout)
 */
export function clearSignedUrlCache(): void {
  cache.clear();
  pendingRequests.clear();
}

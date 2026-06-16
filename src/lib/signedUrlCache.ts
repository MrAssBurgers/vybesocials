/**
 * Ultra-fast Signed URL Cache
 * Pre-warms cache during app startup for instant image loading
 * Includes failed URL caching to prevent repeated 404 attempts
 */

import { supabase } from '@/integrations/supabase/client';
import { hprmicSupabase } from '@/integrations/supabase/hprmicClient';
import { NEW_WRITES_PROJECT_ID } from '@/lib/canonicalSupabase';
import { getSupabaseProjectRef } from '@/lib/supabaseStorageKey';
import { normalizeMediaUrl } from '@/lib/mediaUrl';

interface CacheEntry {
  signedUrl: string;
  expiresAt: number;
  failed?: boolean;
}

// Global in-memory cache
const cache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<string | null>>();

// Cache for 50 minutes (before 1 hour expiry)
const CACHE_DURATION = 50 * 60 * 1000;
// Cache failed URLs for 30 seconds to allow faster recovery from transient failures
const FAILED_CACHE_DURATION = 30 * 1000;

// Project IDs for URL validation (current + legacy)
const CURRENT_SUPABASE_PROJECT = getSupabaseProjectRef();
const LEGACY_SUPABASE_PROJECTS = [
  'eabvbtkxdbttjpdpbmuw',
  'agtcyxjxgkdyoxwxkjth',
  'hprmicwhlaaqfgshucec',
  'szthqtnbepupjqjxaduu',
];

function isProjectUrl(url: string): boolean {
  if (url.includes(CURRENT_SUPABASE_PROJECT)) return true;
  return LEGACY_SUPABASE_PROJECTS.some((ref) => url.includes(ref));
}

/**
 * Parse storage URL to get bucket and path
 */
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  if (!url) return null;
  
  // Only parse URLs from known projects
  if (!isProjectUrl(url)) {
    return null;
  }
  
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
 * Check if URL needs signing (is a Supabase storage URL from CURRENT project)
 */
export function needsSigning(url: string | null | undefined): boolean {
  if (!url) return false;
  // Sign URLs from current or legacy project
  const isStorageUrl = url.includes('/storage/v1/object/public/') || url.includes('/storage/v1/object/sign/');
  return isStorageUrl && isProjectUrl(url);
}

/**
 * Get cached signed URL synchronously - returns null if not cached
 * Returns original URL for failed entries (cached 404s)
 */
export function getCachedSignedUrl(publicUrl: string | null | undefined): string | null {
  const url = normalizeMediaUrl(publicUrl);
  if (!url) return null;

  if (!needsSigning(url)) return url;

  const entry = cache.get(url);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.failed ? null : entry.signedUrl;
  }

  return null;
}

export function isFailedUrl(publicUrl: string): boolean {
  const url = normalizeMediaUrl(publicUrl);
  if (!url) return false;
  const entry = cache.get(url);
  return !!(entry && entry.failed && entry.expiresAt > Date.now());
}

export async function getSignedUrl(publicUrl: string): Promise<string | null> {
  const url = normalizeMediaUrl(publicUrl);
  if (!url) return null;

  if (!needsSigning(url)) return url;

  const entry = cache.get(url);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.failed ? null : entry.signedUrl;
  }

  const pending = pendingRequests.get(url);
  if (pending) return pending;

  const request = (async () => {
    try {
      const parsed = parseStorageUrl(url);
      if (!parsed) return url;

      const storageClient = url.includes(NEW_WRITES_PROJECT_ID) ? hprmicSupabase : supabase;
      const { data, error } = await storageClient.storage
        .from(parsed.bucket)
        .createSignedUrl(parsed.path, 3600);

      if (error || !data?.signedUrl) {
        cache.set(url, {
          signedUrl: url,
          expiresAt: Date.now() + FAILED_CACHE_DURATION,
          failed: true,
        });
        return null;
      }

      cache.set(url, {
        signedUrl: data.signedUrl,
        expiresAt: Date.now() + CACHE_DURATION,
      });

      return data.signedUrl;
    } catch {
      cache.set(url, {
        signedUrl: url,
        expiresAt: Date.now() + FAILED_CACHE_DURATION,
        failed: true,
      });
      return null;
    } finally {
      pendingRequests.delete(url);
    }
  })();

  pendingRequests.set(url, request);
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
    const normalized = normalizeMediaUrl(url);
    if (!normalized || !needsSigning(normalized)) continue;
    
    const entry = cache.get(normalized);
    if (entry && entry.expiresAt > Date.now()) continue;

    if (pendingRequests.has(normalized)) continue;

    const parsed = parseStorageUrl(normalized);
    if (parsed) {
      urlsToSign.push({ url: normalized, ...parsed });
    }
  }
  
  if (urlsToSign.length === 0) return;
  
  // Group by bucket + project for efficient batch requests
  const byBucket = new Map<string, Map<string, string>>(); // `${project}:${bucket}` -> path -> url
  for (const item of urlsToSign) {
    const projectRef = item.url.includes(NEW_WRITES_PROJECT_ID)
      ? NEW_WRITES_PROJECT_ID
      : CURRENT_SUPABASE_PROJECT;
    const bucketKey = `${projectRef}:${item.bucket}`;
    let bucketMap = byBucket.get(bucketKey);
    if (!bucketMap) {
      bucketMap = new Map();
      byBucket.set(bucketKey, bucketMap);
    }
    if (!bucketMap.has(item.path)) {
      bucketMap.set(item.path, item.url);
    }
  }

  const promises = Array.from(byBucket.entries()).map(async ([bucketKey, pathMap]) => {
    try {
      const [projectRef, bucket] = bucketKey.split(':');
      const paths = Array.from(pathMap.keys());
      const originalUrls = Array.from(pathMap.values());
      const storageClient = projectRef === NEW_WRITES_PROJECT_ID ? hprmicSupabase : supabase;

      const { data, error } = await storageClient.storage
        .from(bucket)
        .createSignedUrls(paths, 3600);
      
      const now = Date.now();
      
      if (error || !data) {
        // Cache all as failed to prevent repeated attempts
        for (const url of originalUrls) {
          cache.set(url, {
            signedUrl: url,
            expiresAt: now + FAILED_CACHE_DURATION,
            failed: true,
          });
        }
        return;
      }
      
      // Cache all results (success or failure per-item)
      for (let i = 0; i < paths.length; i++) {
        const signedUrl = data[i]?.signedUrl;
        const originalUrl = originalUrls[i];
        
        if (signedUrl) {
          cache.set(originalUrl, {
            signedUrl,
            expiresAt: now + CACHE_DURATION,
          });
        } else {
          // Individual item failed (404)
          cache.set(originalUrl, {
            signedUrl: originalUrl,
            expiresAt: now + FAILED_CACHE_DURATION,
            failed: true,
          });
        }
      }
    } catch {
      // Silent fail - mark all as failed to prevent retries
      const now = Date.now();
      for (const url of pathMap.values()) {
        cache.set(url, {
          signedUrl: url,
          expiresAt: now + FAILED_CACHE_DURATION,
          failed: true,
        });
      }
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

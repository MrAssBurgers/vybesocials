/**
 * Ultra-fast Signed URL Cache
 * Pre-warms cache during app startup for instant image loading
 * Includes failed URL caching to prevent repeated 404 attempts
 */

import { db } from '@/lib/firebase';
import { firebaseStorage } from '@/lib/firebase/storageService';
import { getFirebaseConfig, isFirebaseConfigured } from '@/lib/firebase/config';
import { firebaseStorageNeedsToken, normalizeMediaUrl } from '@/lib/mediaUrl';

interface CacheEntry {
  signedUrl: string;
  expiresAt: number;
  failed?: boolean;
}

// Global in-memory cache
const cache = new Map<string, CacheEntry>();
const pendingRequests = new Map<string, Promise<string | null>>();

const SIGNED_URL_STORAGE_KEY = 'vybe-signed-url-cache-v1';
const MAX_PERSISTED_ENTRIES = 240;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function setCacheEntry(url: string, entry: CacheEntry): void {
  cache.set(url, entry);
  if (!entry.failed) schedulePersistSignedUrlCache();
}

function schedulePersistSignedUrlCache(): void {
  if (typeof sessionStorage === 'undefined') return;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      const now = Date.now();
      const payload: Record<string, CacheEntry> = {};
      cache.forEach((entry, key) => {
        if (entry.expiresAt > now && !entry.failed) payload[key] = entry;
      });
      const keys = Object.keys(payload);
      if (keys.length > MAX_PERSISTED_ENTRIES) {
        keys
          .sort((a, b) => payload[b].expiresAt - payload[a].expiresAt)
          .slice(MAX_PERSISTED_ENTRIES)
          .forEach((k) => delete payload[k]);
      }
      sessionStorage.setItem(SIGNED_URL_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore quota */
    }
  }, 120);
}

export function hydrateSignedUrlCacheFromSession(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(SIGNED_URL_STORAGE_KEY);
    if (!raw) return;
    const payload = JSON.parse(raw) as Record<string, CacheEntry>;
    const now = Date.now();
    for (const [key, entry] of Object.entries(payload)) {
      if (entry?.expiresAt > now && !entry.failed) cache.set(key, entry);
    }
  } catch {
    /* ignore */
  }
}

hydrateSignedUrlCacheFromSession();

// Cache for 50 minutes (before 1 hour expiry)
const CACHE_DURATION = 50 * 60 * 1000;
// Cache failed URLs for 30 seconds to allow faster recovery from transient failures
const FAILED_CACHE_DURATION = 30 * 1000;

// Project IDs for URL validation (current Firebase + legacy Supabase hosts)
function getCurrentProjectId(): string {
  try {
    if (isFirebaseConfigured()) return getFirebaseConfig().projectId;
  } catch { /* */ }
  return 'vybe-daaab';
}
const CURRENT_PROJECT_ID = getCurrentProjectId();
const LEGACY_HOST_REFS = [
  'eabvbtkxdbttjpdpbmuw',
  'agtcyxjxgkdyoxwxkjth',
  'hprmicwhlaaqfgshucec',
  'szthqtnbepupjqjxaduu',
  'vybe-daaab',
];

function isProjectUrl(url: string): boolean {
  if (url.includes(CURRENT_PROJECT_ID)) return true;
  return LEGACY_HOST_REFS.some((ref) => url.includes(ref));
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
 * Check if URL needs signing.
 * Public bucket URLs load directly; only private/signed paths need a token.
 */
export function needsSigning(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith('gs://')) return true;
  if (url.includes('firebasestorage.googleapis.com')) return false;
  if (url.includes('/storage/v1/object/public/')) return false;
  return url.includes('/storage/v1/object/sign/') && isProjectUrl(url);
}

/**
 * Get cached signed URL synchronously - returns null if not cached
 * Returns original URL for failed entries (cached 404s)
 */
export function getCachedSignedUrl(publicUrl: string | null | undefined): string | null {
  const url = normalizeMediaUrl(publicUrl);
  if (!url) return null;

  if (firebaseStorageNeedsToken(url)) return null;
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
      if (!parsed) {
        const resolved = await firebaseStorage.resolveMediaUrl(url);
        if (resolved && resolved !== url && resolved.startsWith('http')) {
          setCacheEntry(url, {
            signedUrl: resolved,
            expiresAt: Date.now() + CACHE_DURATION,
          });
          return resolved;
        }
        return url.startsWith('http') ? url : null;
      }

      const { data, error } = await db.storage
        .from(parsed.bucket)
        .createSignedUrl(parsed.path, 3600);

      if (error || !data?.signedUrl) {
        const resolved = await firebaseStorage.resolveMediaUrl(url);
        if (resolved && resolved.startsWith('http')) {
          setCacheEntry(url, {
            signedUrl: resolved,
            expiresAt: Date.now() + CACHE_DURATION,
          });
          return resolved;
        }
        if (url.includes('/storage/v1/object/public/')) {
          setCacheEntry(url, {
            signedUrl: url,
            expiresAt: Date.now() + CACHE_DURATION,
          });
          return url;
        }
        cache.set(url, {
          signedUrl: url,
          expiresAt: Date.now() + FAILED_CACHE_DURATION,
          failed: true,
        });
        return null;
      }

      setCacheEntry(url, {
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
  const byBucket = new Map<string, Map<string, string>>();
  for (const item of urlsToSign) {
    const bucketKey = `${isFirebaseConfigured() ? getFirebaseConfig().projectId : 'firebase'}:${item.bucket}`;
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
      const [, bucket] = bucketKey.split(':');
      const paths = Array.from(pathMap.keys());
      const originalUrls = Array.from(pathMap.values());

      const { data, error } = await db.storage
        .from(bucket)
        .createSignedUrls(paths, 3600);
      
      const now = Date.now();
      
      if (error || !data) {
        // Cache all as failed to prevent repeated attempts
        for (const url of originalUrls) {
          setCacheEntry(url, {
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
          setCacheEntry(originalUrl, {
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
  schedulePersistSignedUrlCache();
}

/**
 * Batch sign URLs then resolve stubborn legacy paths via Firebase Storage.
 */
export async function ensureMediaUrlsReady(urls: (string | null | undefined)[]): Promise<void> {
  await batchSignUrls(urls);

  const unique = [...new Set(urls.map((u) => normalizeMediaUrl(u)).filter(Boolean) as string[])];
  if (unique.length === 0) return;

  const needResolve = unique.filter((url) => {
    if (needsSigning(url)) {
      return isFailedUrl(url) || !getCachedSignedUrl(url);
    }
    if ((url.includes('supabase.co') || url.includes('firebasestorage.googleapis.com')) && !url.includes('/object/public/')) {
      return !getCachedSignedUrl(url);
    }
    return false;
  });

  await Promise.all(
    needResolve.map(async (url) => {
      try {
        const resolved = await firebaseStorage.resolveMediaUrl(url);
        if (resolved?.startsWith('http')) {
          setCacheEntry(url, {
            signedUrl: resolved,
            expiresAt: Date.now() + CACHE_DURATION,
          });
        }
      } catch {
        // keep existing failed cache entry
      }
    }),
  );
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

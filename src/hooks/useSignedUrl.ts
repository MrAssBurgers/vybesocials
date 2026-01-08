import { useState, useEffect } from 'react';
import { getSignedUrlFromPublic, parseStorageUrl, createSignedUrl } from '@/lib/storage';

// Cache for signed URLs to avoid re-fetching
const urlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Hook to convert a storage URL to a signed URL
 * Caches results to avoid redundant API calls
 */
export function useSignedUrl(publicUrl: string | null | undefined): string | null {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!publicUrl) {
      setSignedUrl(null);
      return;
    }

    // Check if it's a Supabase storage URL
    const parsed = parseStorageUrl(publicUrl);
    if (!parsed) {
      // Not a storage URL, use as-is
      setSignedUrl(publicUrl);
      return;
    }

    // Check cache
    const cached = urlCache.get(publicUrl);
    if (cached && cached.expiresAt > Date.now()) {
      setSignedUrl(cached.url);
      return;
    }

    // Fetch signed URL
    let cancelled = false;
    createSignedUrl(parsed.bucket, parsed.path, 3600).then((url) => {
      if (!cancelled && url) {
        // Cache for 50 minutes (before 1 hour expiry)
        urlCache.set(publicUrl, { url, expiresAt: Date.now() + 50 * 60 * 1000 });
        setSignedUrl(url);
      } else if (!cancelled) {
        // Fallback to original URL
        setSignedUrl(publicUrl);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [publicUrl]);

  return signedUrl;
}

/**
 * Hook to convert multiple URLs to signed URLs
 */
export function useSignedUrls(urls: (string | null | undefined)[]): (string | null)[] {
  const [signedUrls, setSignedUrls] = useState<(string | null)[]>([]);

  useEffect(() => {
    const fetchUrls = async () => {
      const results = await Promise.all(
        urls.map(async (url) => {
          if (!url) return null;
          
          const parsed = parseStorageUrl(url);
          if (!parsed) return url;

          // Check cache
          const cached = urlCache.get(url);
          if (cached && cached.expiresAt > Date.now()) {
            return cached.url;
          }

          const signedUrl = await createSignedUrl(parsed.bucket, parsed.path, 3600);
          if (signedUrl) {
            urlCache.set(url, { url: signedUrl, expiresAt: Date.now() + 50 * 60 * 1000 });
            return signedUrl;
          }
          return url;
        })
      );
      setSignedUrls(results);
    };

    fetchUrls();
  }, [JSON.stringify(urls)]);

  return signedUrls;
}

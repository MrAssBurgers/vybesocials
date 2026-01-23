/**
 * Unified Signed URL Hook
 * Uses the optimized signedUrlCache for instant, cached URL access
 */
import { useFastSignedUrl, useFastSignedUrls } from './useFastSignedUrl';

/**
 * Hook to convert a storage URL to a signed URL
 * Uses optimized cache for instant access
 */
export function useSignedUrl(publicUrl: string | null | undefined): string | null {
  return useFastSignedUrl(publicUrl);
}

/**
 * Hook to convert multiple URLs to signed URLs
 * Uses batch signing for efficiency
 */
export function useSignedUrls(urls: (string | null | undefined)[]): (string | null)[] {
  return useFastSignedUrls(urls);
}

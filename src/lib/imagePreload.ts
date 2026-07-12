import { transformedImage } from '@/lib/imageTransform';
import { getCachedSignedUrl, ensureMediaUrlsReady } from '@/lib/signedUrlCache';
import { normalizeMediaUrl } from '@/lib/mediaUrl';

const injectedPreloads = new Set<string>();
const MAX_PRELOAD_LINKS = 16;

/** Hint the browser to fetch critical above-fold images before first paint. */
export function injectImagePreload(href: string): void {
  if (typeof document === 'undefined' || !href || injectedPreloads.has(href)) return;
  if (injectedPreloads.size >= MAX_PRELOAD_LINKS) return;
  injectedPreloads.add(href);
  const link = document.createElement('link');
  link.rel = 'preload';
  link.as = 'image';
  link.href = href;
  document.head.appendChild(link);
}

/** Decode an image URL into the browser cache (fire-and-forget). */
export function preloadImageUrl(
  url: string | null | undefined,
  options?: { width?: number; quality?: number; priority?: 'high' | 'auto' },
): void {
  const normalized = normalizeMediaUrl(url);
  if (!normalized) return;

  const resolved = getCachedSignedUrl(normalized) || normalized;
  const src =
    transformedImage(resolved, {
      width: options?.width ?? 720,
      quality: options?.quality ?? 78,
    }) ?? resolved;

  const img = new Image();
  img.decoding = options?.priority === 'high' ? 'sync' : 'async';
  if (options?.priority === 'high' && 'fetchPriority' in img) {
    (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'high';
  }
  img.src = src;
  if (options?.priority === 'high') injectImagePreload(src);
}

/** Preload the first N feed media + avatar URLs after signing. */
export function preloadFeedPostsMedia(
  posts: Array<{
    media_url?: string | null;
    thumbnail_url?: string | null;
    author?: { avatar_url?: string | null };
  }>,
  cap = 12,
): void {
  posts.slice(0, cap).forEach((post, index) => {
    const priority = index < 4 ? 'high' : 'auto';
    const thumb = post.thumbnail_url;
    const media = post.media_url;

    if (thumb) {
      preloadImageUrl(thumb, { width: 480, quality: 65, priority });
    }
    if (media) {
      preloadImageUrl(media, { width: thumb ? 960 : 720, quality: 80, priority });
    }
    if (post.author?.avatar_url) {
      preloadImageUrl(post.author.avatar_url, { width: 96, quality: 80, priority });
    }
  });
}

/** Sign storage URLs then decode into the browser image cache. */
export async function signAndPreloadFeedPosts(
  posts: Parameters<typeof preloadFeedPostsMedia>[0],
  cap = 12,
): Promise<void> {
  if (!posts.length) return;
  const slice = posts.slice(0, cap);
  const urls = slice.flatMap((post) => [
    post.thumbnail_url,
    post.media_url,
    post.author?.avatar_url,
  ]);
  await ensureMediaUrlsReady(urls);
  preloadFeedPostsMedia(slice, cap);
}

/** Profile avatar — sign + high-priority decode for greeting / stories. */
export async function signAndPreloadProfileAvatar(
  avatarUrl: string | null | undefined,
  transformSize = 160,
): Promise<void> {
  const normalized = normalizeMediaUrl(avatarUrl);
  if (!normalized) return;
  await ensureMediaUrlsReady([normalized]);
  preloadImageUrl(normalized, { width: transformSize, quality: 85, priority: 'high' });
}

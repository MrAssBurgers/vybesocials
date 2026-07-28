/**
 * useAheadMediaPreload
 *
 * Aggressively preloads media (images + video first-frame) for the next N
 * posts ahead of the currently-viewed post. Unlike the scroll-pausing
 * preloader, this fires IMMEDIATELY on index change because the user is
 * scrolling toward those posts — we need them ready, not deferred.
 *
 * - Pre-signs URLs via signedUrlCache (instant if cached)
 * - Decodes images via new Image() so the browser caches the decoded bitmap
 * - For videos: forces first-frame decode so the poster appears instantly
 * - Hard cap on concurrent loads to avoid hammering the network
 * - Ref-based dedupe — never re-fetches the same URL in this session
 */
import { useEffect, useRef } from 'react';
import { batchSignUrls, getCachedSignedUrl, needsSigning } from '@/lib/signedUrlCache';
import { normalizeMediaUrl, shouldPreloadMediaUrl } from '@/lib/mediaUrl';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { isNativePerfMode } from '@/lib/nativePerfMode';

interface PostLike {
  id: string;
  type?: string;
  media_url?: string | null;
  thumbnail_url?: string | null;
  author?: { avatar_url?: string | null } | null;
}

const MAX_CONCURRENT = isNativePerfMode() ? 3 : 6;
const preloaded = new Set<string>();
let inFlight = 0;
const queue: Array<() => void> = [];

const isIOS = (() => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
})();

function pump() {
  while (inFlight < MAX_CONCURRENT && queue.length > 0) {
    const next = queue.shift();
    if (next) next();
  }
}

function schedule(task: (done: () => void) => void) {
  const run = () => {
    inFlight++;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      inFlight--;
      pump();
    };
    try {
      task(done);
    } catch {
      done();
    }
  };
  if (inFlight < MAX_CONCURRENT) run();
  else queue.push(run);
}

function preloadImage(url: string) {
  if (!shouldPreloadMediaUrl(url) || preloaded.has(url)) return;
  preloaded.add(url);
  schedule((done) => {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    const finish = () => done();
    if (img.decode) {
      img.decode().then(finish, finish);
    } else {
      img.onload = finish;
      img.onerror = finish;
    }
    // Safety timeout
    setTimeout(finish, 8000);
  });
}

function preloadVideoFirstFrame(url: string) {
  if (!shouldPreloadMediaUrl(url) || preloaded.has(url)) return;
  preloaded.add(url);
  // iOS chokes on hidden <video> decoding — only preload metadata there
  schedule((done) => {
    const video = document.createElement('video');
    video.preload = isIOS ? 'metadata' : 'auto';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('webkit-playsinline', 'true');
    video.crossOrigin = 'anonymous';
    video.src = url;

    const cleanup = () => {
      try {
        video.src = '';
        video.load();
      } catch {}
      done();
    };

    if (isIOS) {
      video.onloadedmetadata = cleanup;
    } else {
      video.onloadeddata = cleanup;
      // Seek to 0.1s to force first-frame decode
      video.onloadedmetadata = () => {
        try {
          video.currentTime = 0.1;
        } catch {}
      };
    }
    video.onerror = cleanup;
    setTimeout(cleanup, 6000);
  });
}

/**
 * Preload media for the next `ahead` posts after currentIndex.
 */
export function useAheadMediaPreload(
  posts: PostLike[],
  currentIndex: number,
  ahead = 3,
  enabled = true,
) {
  const lastWindowRef = useRef('');
  const { isOnline, isSlowConnection, saveData } = useNetworkStatus();

  useEffect(() => {
    if (!enabled || !isOnline || !posts || posts.length === 0) return;
    // On constrained connections warm only the currently visible item. This
    // preserves a smooth first paint without silently consuming several posts.
    const effectiveAhead = isSlowConnection || saveData ? 0 : ahead;
    const windowKey = `${currentIndex}:${effectiveAhead}:${posts.length}`;
    if (windowKey === lastWindowRef.current) return;
    lastWindowRef.current = windowKey;
    const start = Math.max(0, currentIndex);
    const end = Math.min(posts.length, currentIndex + effectiveAhead + 1);
    const window = posts.slice(start, end);
    if (window.length === 0) return;

    // 1) Collect every URL we want signed
    const urlsToSign: string[] = [];
    for (const p of window) {
      if (shouldPreloadMediaUrl(p.thumbnail_url)) urlsToSign.push(p.thumbnail_url!);
      if (shouldPreloadMediaUrl(p.media_url)) urlsToSign.push(p.media_url!);
      if (shouldPreloadMediaUrl(p.author?.avatar_url)) urlsToSign.push(p.author!.avatar_url!);
    }

    // 2) Sign in one batch, then warm media
    const warm = () => {
      for (const p of window) {
        const isVideo = p.type === 'short' || p.type === 'video';
        const thumb = p.thumbnail_url ? getCachedSignedUrl(p.thumbnail_url) : null;
        const media = p.media_url ? getCachedSignedUrl(p.media_url) : null;
        const avatar = p.author?.avatar_url ? getCachedSignedUrl(p.author.avatar_url) : null;

        // Always warm the thumbnail (it's what users see first)
        if (thumb && !needsSigning(thumb)) preloadImage(thumb);

        if (isVideo) {
          // Warm the video's first frame so the poster appears instantly
          if (media && !needsSigning(media)) preloadVideoFirstFrame(media);
        } else if (media && !needsSigning(media) && media !== thumb) {
          preloadImage(media);
        }

        if (avatar && !needsSigning(avatar)) preloadImage(avatar);
      }
    };

    if (urlsToSign.some((u) => needsSigning(u))) {
      batchSignUrls(urlsToSign).then(warm).catch(warm);
    } else {
      warm();
    }
  }, [posts, currentIndex, ahead, enabled, isOnline, isSlowConnection, saveData]);
}

/**
 * Imperative variant for components that already have signed URLs.
 */
export function warmMediaAhead(urls: Array<{ url: string; isVideo?: boolean }>) {
  for (const item of urls) {
    if (!shouldPreloadMediaUrl(item.url)) continue;
    if (item.isVideo) preloadVideoFirstFrame(item.url);
    else preloadImage(item.url);
  }
}

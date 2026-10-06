/** Warm upcoming media within a bounded, cancelable window. The visible
 * video owns its own fetch; failed/canceled warming may be retried later.
 */
import { useEffect, useRef } from 'react';
import { preloadDetachedVideo } from '@/lib/detachedVideoPreload';
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
const preloaded = new Map<string, { completed: boolean }>();
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

function schedule(task: (done: () => void) => void, signal?: AbortSignal) {
  const cancelQueued = () => { const index = queue.indexOf(run); if (index >= 0) queue.splice(index, 1); };
  const run = () => {
    signal?.removeEventListener('abort', cancelQueued);
    if (signal?.aborted) return;
    inFlight++;
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      inFlight--;
      pump();
    };
    try { task(done); } catch { done(); }
  };
  if (signal?.aborted) return;
  if (inFlight < MAX_CONCURRENT) run();
  else { queue.push(run); signal?.addEventListener('abort', cancelQueued, { once: true }); }
}

function reserve(url: string, signal?: AbortSignal) {
  if (signal?.aborted || !shouldPreloadMediaUrl(url) || preloaded.has(url)) return null;
  const reservation = { completed: false };
  preloaded.set(url, reservation);
  const retire = () => { if (preloaded.get(url) === reservation) preloaded.delete(url); };
  signal?.addEventListener('abort', retire, { once: true });
  return (success: boolean) => {
    signal?.removeEventListener('abort', retire);
    if (!success || signal?.aborted) retire();
    else {
      reservation.completed = true;
      if (preloaded.size > 256) for (const [key, value] of preloaded) {
        if (value.completed) { preloaded.delete(key); if (preloaded.size <= 256) break; }
      }
    }
  };
}

function preloadImage(url: string, signal?: AbortSignal) {
  const complete = reserve(url, signal);
  if (!complete) return;
  schedule(done => {
    const img = new Image();
    let finished = false;
    const finish = (success: boolean) => {
      if (finished) return;
      finished = true; clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      img.onload = img.onerror = null;
      if (!success) img.removeAttribute('src');
      complete(success); done();
    };
    const cancel = () => finish(false);
    signal?.addEventListener('abort', cancel, { once: true });
    img.decoding = 'async';
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    const timer = setTimeout(() => finish(false), 8000);
    img.src = url;
    if (img.decode) img.decode().then(() => finish(true), () => finish(false));
  }, signal);
}

function preloadVideoFirstFrame(url: string, signal?: AbortSignal) {
  const complete = reserve(url, signal);
  if (!complete) return;
  schedule(done => {
    void preloadDetachedVideo(url, {
      preload: isIOS ? 'metadata' : 'auto',
      event: isIOS ? 'loadedmetadata' : 'loadeddata',
      timeout: 6000, signal, seekFirstFrame: !isIOS, crossOrigin: true,
    }).then(() => complete(true), () => complete(false)).finally(done);
  }, signal);
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
    const controller = new AbortController();

    // 1) Collect every URL we want signed
    const urlsToSign: string[] = [];
    for (const p of window) {
      if (shouldPreloadMediaUrl(p.thumbnail_url)) urlsToSign.push(p.thumbnail_url!);
      if (shouldPreloadMediaUrl(p.media_url)) urlsToSign.push(p.media_url!);
      if (shouldPreloadMediaUrl(p.author?.avatar_url)) urlsToSign.push(p.author!.avatar_url!);
    }

    // 2) Sign in one batch, then warm media
    const warm = () => {
      if (controller.signal.aborted) return;
      for (const [offset, p] of window.entries()) {
        const isVideo = p.type === 'short' || p.type === 'video';
        const thumb = p.thumbnail_url ? getCachedSignedUrl(p.thumbnail_url) : null;
        const media = p.media_url ? getCachedSignedUrl(p.media_url) : null;
        const avatar = p.author?.avatar_url ? getCachedSignedUrl(p.author.avatar_url) : null;

        // Always warm the thumbnail (it's what users see first)
        if (thumb && !needsSigning(thumb)) preloadImage(thumb, controller.signal);

        if (isVideo) {
          // Warm the video's first frame so the poster appears instantly
          if (offset > 0 && !isSlowConnection && !saveData && media && !needsSigning(media)) preloadVideoFirstFrame(media, controller.signal);
        } else if (media && !needsSigning(media) && media !== thumb) {
          preloadImage(media, controller.signal);
        }

        if (avatar && !needsSigning(avatar)) preloadImage(avatar, controller.signal);
      }
    };

    if (urlsToSign.some((u) => needsSigning(u))) {
      batchSignUrls(urlsToSign).then(warm).catch(warm);
    } else {
      warm();
    }
    return () => { controller.abort(); lastWindowRef.current = ''; };
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

import { useCallback, useEffect, useRef, type RefObject } from 'react';

/** Keep a decoder/buffer only for the foreground clip, even for cached URLs. */
export function useClipMediaSource(videoRef: RefObject<HTMLVideoElement>, url: string | null | undefined, active: boolean) {
  const attached = useRef<HTMLVideoElement | null>(null);
  const release = useCallback(() => {
    const video = attached.current;
    if (!video) return;
    attached.current = null;
    video.pause();
    video.removeAttribute('src');
    // Pausing alone retains downloaded buffers and mobile decoder resources.
    video.load();
  }, []);
  useEffect(() => {
    const video = videoRef.current;
    if (attached.current && attached.current !== video) release();
    if (video && active && url) {
      // StrictMode replays effects after cleanup without recommitting JSX src.
      // Restore only the current authorized active source, never an old URL.
      if (video.getAttribute('src') !== url) video.setAttribute('src', url);
      attached.current = video;
      return;
    }
    release();
  }, [active, url, videoRef, release]);
  useEffect(() => release, [release]);
  return active && url ? url : undefined;
}

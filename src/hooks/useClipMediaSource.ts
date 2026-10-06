import { useEffect, useRef, type RefObject } from 'react';

/** Keep a decoder/buffer only for the foreground clip, even for cached URLs. */
export function useClipMediaSource(videoRef: RefObject<HTMLVideoElement>, url: string | null | undefined, active: boolean) {
  const attached = useRef(false);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active && url) { attached.current = true; return; }
    if (!attached.current) return;
    attached.current = false;
    video.pause();
    video.removeAttribute('src');
    // Pausing alone retains downloaded buffers and mobile decoder resources.
    video.load();
  }, [active, url, videoRef]);
  return active && url ? url : undefined;
}

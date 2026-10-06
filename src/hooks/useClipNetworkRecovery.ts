import { useCallback, useEffect, useReducer, type RefObject } from 'react';

/** Retry the foreground clip after a network failure, never a departed clip. */
export function useClipNetworkRecovery(
  videoRef: RefObject<HTMLVideoElement>, active: boolean, source: string | null | undefined,
  scope: unknown, paused: RefObject<boolean>, onReload: () => void,
) {
  const [revision, retryPlayback] = useReducer((n: number) => n + 1, 0);
  const retry = useCallback(() => {
    const video = videoRef.current;
    if (!active || !source || !video || paused.current || document.visibilityState === 'hidden' || navigator.onLine === false) return;
    video.load();
    onReload();
    retryPlayback();
  }, [active, source, scope, videoRef, paused, onReload]);
  useEffect(() => {
    const recover = () => {
      // Reloading decoder/unsupported-source failures repeatedly cannot fix them.
      if (videoRef.current?.error?.code === 2) retry();
    };
    recover(); // Foreground state commits after visibilitychange dispatch.
    window.addEventListener('online', recover);
    document.addEventListener('visibilitychange', recover);
    return () => {
      window.removeEventListener('online', recover);
      document.removeEventListener('visibilitychange', recover);
    };
  }, [retry, videoRef]);
  return { revision, retry };
}

import { useCallback, useEffect, useMemo, useReducer, type RefObject } from 'react';

/** Retry the foreground clip after a network failure, never a departed clip. */
export function useClipNetworkRecovery(
  videoRef: RefObject<HTMLVideoElement>, active: boolean, source: string | null | undefined,
  scope: unknown, paused: RefObject<boolean>, onReload: () => void,
) {
  const [revision, retryPlayback] = useReducer((n: number) => n + 1, 0);
  const context = useMemo(() => ({ retries: 0, failed: false }), [active, source, scope]);
  const [, update] = useReducer((n: number) => n + 1, 0);
  const retry = useCallback(() => {
    const video = videoRef.current;
    if (!active || !source || !video || paused.current || document.visibilityState === 'hidden' || navigator.onLine === false) return;
    video.load();
    context.failed = false;
    onReload();
    retryPlayback();
  }, [active, source, scope, videoRef, paused, onReload, context]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active || !source) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const eligible = () => !paused.current && document.visibilityState !== 'hidden' && navigator.onLine !== false;
    const networkFailure = () => video.error?.code === 2 || (!video.error && video.readyState < 3);
    const stop = () => { clearTimeout(timer); timer = undefined; };
    const watch = () => {
      if (timer !== undefined || context.failed || !eligible() || !networkFailure()) return;
      timer = setTimeout(() => {
        timer = undefined;
        if (!eligible() || !networkFailure()) return;
        if (context.retries < 1) { context.retries++; retry(); }
        else { context.failed = true; update(); }
      }, 12_000);
    };
    const playing = () => { stop(); context.retries = 0; if (context.failed) { context.failed = false; update(); } };
    const recover = () => {
      stop();
      // Reloading decoder/unsupported-source failures repeatedly cannot fix them.
      if (eligible() && networkFailure()) { context.retries = 1; retry(); }
      watch();
    };
    const error = () => {
      if (video.error?.code !== 2 || !eligible()) return;
      if (context.retries === 0) { context.retries = 1; retry(); }
      else watch();
    };
    // Some mobile transports stall without emitting a MediaError. Bound both
    // initial buffering and later waits, without polling every rendered card.
    // A foreground remount already carrying a network error needs immediate
    // recovery; ordinary initial buffering gets the bounded waiting window.
    if (eligible() && video.error?.code === 2 && context.retries === 0) { context.retries = 1; retry(); }
    else watch();
    video.addEventListener('waiting', watch);
    video.addEventListener('stalled', watch);
    video.addEventListener('error', error);
    video.addEventListener('playing', playing);
    window.addEventListener('online', recover);
    document.addEventListener('visibilitychange', recover);
    return () => {
      stop();
      video.removeEventListener('waiting', watch);
      video.removeEventListener('stalled', watch);
      video.removeEventListener('error', error);
      video.removeEventListener('playing', playing);
      window.removeEventListener('online', recover);
      document.removeEventListener('visibilitychange', recover);
    };
  }, [retry, videoRef, active, source, revision, context, paused]);
  return { revision, retry, stalled: active && context.failed };
}

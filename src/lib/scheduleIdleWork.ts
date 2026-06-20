/** Run non-critical work after first paint / when the main thread is idle. */
export function scheduleIdleWork(work: () => void, timeoutMs = 2000): () => void {
  if (typeof window === 'undefined') {
    work();
    return () => {};
  }

  const idle = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;

  if (idle) {
    const id = idle(work, { timeout: timeoutMs });
    return () => (window as any).cancelIdleCallback?.(id);
  }

  const t = window.setTimeout(work, Math.min(timeoutMs, 800));
  return () => window.clearTimeout(t);
}

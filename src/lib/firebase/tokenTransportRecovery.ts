import { isAppForeground } from '@/lib/foregroundReadPhase';

/** Loaded only after a token failure; never owns a credential or signs in. */
export function recoverTokenTransport(retry: () => Promise<boolean>, guard: () => unknown) {
  let stopped = false, pending = false, attempts = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const current = () => { try { return guard() !== false; } catch { return false; } };
  const eligible = () => !stopped && current() && isAppForeground() && navigator.onLine !== false;
  const schedule = () => {
    if (stopped || timer !== undefined || attempts >= 2) return;
    timer = setTimeout(() => { timer = undefined; void run(); }, attempts === 0 ? 2000 : 8000);
  };
  const run = async () => {
    if (!eligible() || pending) return;
    clearTimeout(timer); timer = undefined;
    pending = true; attempts++;
    try { if (await retry()) stop(); }
    finally { pending = false; if (!stopped && current()) schedule(); }
  };
  const foreground = () => { if (eligible()) void run(); };
  const pause = () => { clearTimeout(timer); timer = undefined; };
  const stop = () => {
    stopped = true; clearTimeout(timer);
    window.removeEventListener('online', foreground);
    window.removeEventListener('app-paused', pause);
    window.removeEventListener('app-resumed', foreground);
    document.removeEventListener('visibilitychange', foreground);
  };
  window.addEventListener('online', foreground);
  window.addEventListener('app-paused', pause);
  window.addEventListener('app-resumed', foreground);
  document.addEventListener('visibilitychange', foreground);
  schedule();
  return stop;
}

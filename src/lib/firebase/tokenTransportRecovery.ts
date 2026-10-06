import { isAppForeground, subscribeForegroundReadPhase } from '@/lib/foregroundReadPhase';

/** Loaded only after a token failure; never owns a credential or signs in. */
export function recoverTokenTransport(retry: () => Promise<boolean>, guard: () => unknown) {
  let stopped = false, pending = false, attempts = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastReconnect = -Infinity;
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
    catch { /* A transient transport rejection gets the same bounded retry. */ }
    finally { pending = false; if (!stopped && current()) schedule(); }
  };
  const foreground = () => {
    if (!eligible() || pending) return;
    // A new foreground connection gets its own bounded window. The first
    // request may run before the phone's radio has finished reconnecting.
    attempts = 0;
    void run();
  };
  const online = () => {
    if (!eligible() || pending || Date.now() - lastReconnect < 8000) return;
    lastReconnect = Date.now(); foreground();
  };
  const pause = () => { clearTimeout(timer); timer = undefined; };
  const unsubscribePhase = subscribeForegroundReadPhase(() => {
    if (isAppForeground()) foreground(); else pause();
  });
  const stop = () => {
    stopped = true; clearTimeout(timer);
    window.removeEventListener('online', online);
    unsubscribePhase();
  };
  window.addEventListener('online', online);
  schedule();
  return stop;
}

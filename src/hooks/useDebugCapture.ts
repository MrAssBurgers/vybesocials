/**
 * Global capture hook — intercepts fetch, JS errors, and unhandled rejections.
 * Runs ONCE at app level, always active (not gated by panel open state).
 * Logs go to the in-memory debugLogger, not console.log.
 */
import { useEffect, useRef } from 'react';
import { logEvent, logNetwork } from '@/lib/debugLogger';

export function useDebugCapture() {
  const installedRef = useRef(false);

  useEffect(() => {
    if (installedRef.current) return;
    installedRef.current = true;

    // --- Intercept fetch (lightweight — avoid object allocation in hot path) ---
    const originalFetch = window.fetch;
    window.fetch = async function patchedFetch(input: RequestInfo | URL, init?: RequestInit) {
      const start = performance.now();
      const url = typeof input === 'string' ? input : (input as Request).url;
      const method = (init?.method || 'GET').toUpperCase();

      try {
        const res = await originalFetch.call(window, input, init);
        logNetwork({
          url: url.length > 120 ? url.slice(0, 120) + '…' : url,
          method,
          status: res.status,
          duration: Math.round(performance.now() - start),
          timestamp: Date.now(),
        });
        return res;
      } catch (err: any) {
        logNetwork({
          url: url.length > 120 ? url.slice(0, 120) + '…' : url,
          method,
          status: 0,
          duration: Math.round(performance.now() - start),
          timestamp: Date.now(),
          error: err.message,
        });
        throw err;
      }
    };

    // --- JS errors ---
    const onError = (e: ErrorEvent) => {
      const isStripe = e.message?.toLowerCase().includes('stripe');
      logEvent(isStripe ? 'stripe' : 'error', e.message, { stack: e.error?.stack });
    };

    // --- Unhandled rejections ---
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message || String(e.reason);
      const isStripe = msg.toLowerCase().includes('stripe');
      logEvent(isStripe ? 'stripe' : 'error', msg);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      window.fetch = originalFetch;
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      installedRef.current = false;
    };
  }, []);
}

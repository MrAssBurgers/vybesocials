import type { QueryClient } from '@tanstack/react-query';

/**
 * Global reconnect manager.
 *
 * - Detects when the browser comes back online (or the app becomes visible
 *   on a previously offline tab).
 * - Verifies actual reachability with a fast HEAD probe (since
 *   `navigator.onLine` lies on captive portals, mobile, and PWAs).
 * - Once reachability is confirmed, invalidates active queries so every
 *   visible screen refreshes immediately, just like every other major
 *   social app.
 * - While offline, polls every 3s (backing off to 15s) so we catch
 *   reconnects the OS never fires events for.
 */

const HEALTH_URL = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`;
const PROBE_TIMEOUT_MS = 2500;
const MIN_INTERVAL_MS = 3000;
const MAX_INTERVAL_MS = 15000;

let started = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let currentInterval = MIN_INTERVAL_MS;
let lastKnownOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

const reconnectListeners = new Set<() => void>();

export function onReconnect(cb: () => void): () => void {
  reconnectListeners.add(cb);
  return () => reconnectListeners.delete(cb);
}

async function probeReachable(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  if (!HEALTH_URL || HEALTH_URL === 'undefined/auth/v1/health') return navigator.onLine;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(HEALTH_URL, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(t);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

function fireReconnect(queryClient: QueryClient) {
  // Refetch only active (currently mounted) queries — keeps cost low.
  void queryClient.invalidateQueries({ refetchType: 'active' });
  reconnectListeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore */
    }
  });
}

function schedulePoll(queryClient: QueryClient) {
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    const online = await probeReachable();
    if (online) {
      currentInterval = MIN_INTERVAL_MS;
      if (!lastKnownOnline) {
        lastKnownOnline = true;
        window.dispatchEvent(new CustomEvent('vybe:online'));
        fireReconnect(queryClient);
      }
    } else {
      if (lastKnownOnline) {
        lastKnownOnline = false;
        window.dispatchEvent(new CustomEvent('vybe:offline'));
      }
      currentInterval = Math.min(currentInterval * 1.5, MAX_INTERVAL_MS);
    }
    // Only keep polling while offline — when online we rely on events.
    if (!lastKnownOnline) schedulePoll(queryClient);
  }, currentInterval);
}

export function startReconnectManager(queryClient: QueryClient) {
  if (started || typeof window === 'undefined') return;
  started = true;

  const handleOnline = async () => {
    const ok = await probeReachable();
    if (ok && !lastKnownOnline) {
      lastKnownOnline = true;
      window.dispatchEvent(new CustomEvent('vybe:online'));
      fireReconnect(queryClient);
    } else if (!ok) {
      lastKnownOnline = false;
      schedulePoll(queryClient);
    }
  };

  const handleOffline = () => {
    lastKnownOnline = false;
    currentInterval = MIN_INTERVAL_MS;
    window.dispatchEvent(new CustomEvent('vybe:offline'));
    schedulePoll(queryClient);
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') void handleOnline();
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  document.addEventListener('visibilitychange', handleVisibility);

  const conn = (navigator as any).connection;
  conn?.addEventListener?.('change', handleOnline);

  // Initial probe so we recover from "loaded while offline" cold starts.
  void handleOnline();
}

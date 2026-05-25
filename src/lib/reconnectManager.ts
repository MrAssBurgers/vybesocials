import type { QueryClient } from '@tanstack/react-query';

/**
 * Global reconnect manager.
 *
 * The app should never need to be closed and reopened to come back online.
 * On mobile WebViews (Despia/Capacitor) and PWAs, `navigator.onLine` can lie
 * for long stretches after a real reconnect, so we treat a fast HEAD probe
 * against our own origin as the single source of truth and poll continuously:
 *
 * - Fast cadence (3s → 15s backoff) while we believe we're offline.
 * - Slow heartbeat (60s) while online, so signal loss is caught even when the
 *   OS never fires an `offline` event (cellular handoff, captive portal, etc.).
 * - We also listen to every event that can mean "we might be live again":
 *   `online`, `focus`, `visibilitychange`, `pageshow`, connection change.
 *
 * On every confirmed reconnect we invalidate active stale queries so DMs,
 * feeds, notifications and everything else repaint automatically — no manual
 * refresh or app restart required.
 */

// Probe a static asset on our own origin — never sends auth headers, never
// generates 401 spam, works even when Supabase is reachable but rate-limited.
// Relative path so it works under capacitor://localhost and PWA shells too.
const HEALTH_URL = './favicon.ico';
const PROBE_TIMEOUT_MS = 2500;
const OFFLINE_MIN_MS = 1500;
const OFFLINE_MAX_MS = 15000;
const ONLINE_HEARTBEAT_MS = 60000;

let started = false;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let currentInterval = OFFLINE_MIN_MS;
let lastKnownOnline = true;

const reconnectListeners = new Set<() => void>();

export function onReconnect(cb: () => void): () => void {
  reconnectListeners.add(cb);
  return () => reconnectListeners.delete(cb);
}

async function probeReachable(): Promise<boolean> {
  // Don't trust navigator.onLine — it sticks on mobile WebViews. Always probe.
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(`${HEALTH_URL}?_probe=${Date.now()}`, {
      method: 'HEAD',
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
  // Refetch only ACTIVE + STALE mounted queries. Hitting every active query
  // (including presence/typing/etc.) caused cascading flicker on the DM page.
  void queryClient.invalidateQueries({
    refetchType: 'active',
    predicate: (q) => q.isStale(),
  });
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
  const delay = lastKnownOnline ? ONLINE_HEARTBEAT_MS : currentInterval;
  pollTimer = setTimeout(async () => {
    const online = await probeReachable();
    if (online) {
      currentInterval = OFFLINE_MIN_MS;
      if (!lastKnownOnline) {
        lastKnownOnline = true;
        window.dispatchEvent(new CustomEvent('vybe:online'));
        fireReconnect(queryClient);
      }
    } else {
      if (lastKnownOnline) {
        lastKnownOnline = false;
        currentInterval = OFFLINE_MIN_MS;
        window.dispatchEvent(new CustomEvent('vybe:offline'));
      } else {
        currentInterval = Math.min(currentInterval * 1.5, OFFLINE_MAX_MS);
      }
    }
    // Always keep polling — heartbeat while online, fast probe while offline.
    schedulePoll(queryClient);
  }, delay);
}

export function startReconnectManager(queryClient: QueryClient) {
  if (started || typeof window === 'undefined') return;
  started = true;

  const handleMaybeOnline = async () => {
    const ok = await probeReachable();
    if (ok) {
      if (!lastKnownOnline) {
        lastKnownOnline = true;
        currentInterval = OFFLINE_MIN_MS;
        window.dispatchEvent(new CustomEvent('vybe:online'));
        fireReconnect(queryClient);
      }
    } else if (lastKnownOnline) {
      lastKnownOnline = false;
      currentInterval = OFFLINE_MIN_MS;
      window.dispatchEvent(new CustomEvent('vybe:offline'));
    }
  };

  const handleOffline = () => {
    // Browser told us we're offline — verify, don't trust blindly.
    void handleMaybeOnline();
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') void handleMaybeOnline();
  };

  window.addEventListener('online', handleMaybeOnline);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('focus', handleMaybeOnline);
  window.addEventListener('pageshow', handleMaybeOnline);
  document.addEventListener('visibilitychange', handleVisibility);

  const conn = (navigator as any).connection;
  conn?.addEventListener?.('change', handleMaybeOnline);

  // Initial probe + continuous loop (heartbeat while online, fast retry while offline)
  void handleMaybeOnline();
  schedulePoll(queryClient);
}

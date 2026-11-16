import type { QueryClient } from '@tanstack/react-query';
import { isNativeAppShell } from './despiaBridge';
import { foregroundReadPhaseCurrent, getForegroundReadPhase, subscribeForegroundReadPhase, type ReadPhase } from './foregroundReadPhase';

/**
 * Foreground reachability checks wake stale active reads after recovery.
 * These check the public web origin, not Firebase authorization or the health
 * of every backend service. Native cached localhost assets cannot prove that
 * the network is reachable, so native shells probe the public HTTPS origin.
 */
const PROBE_TIMEOUT_MS = 2500;
const OFFLINE_MIN_MS = 1500;
const OFFLINE_MAX_MS = 15000;
const ONLINE_HEARTBEAT_MS = 60000;
let activeStop: (() => void) | null = null;
let lastKnownOnline = true;
const reconnectListeners = new Set<() => void>();

export const getConnectionOnline = () => lastKnownOnline;
export function onReconnect(cb: () => void): () => void {
  reconnectListeners.add(cb);
  return () => { reconnectListeners.delete(cb); };
}

function fireReconnect(queryClient: QueryClient, current: () => boolean) {
  // Keep the existing stale-active-only refetch, without unhandled rejection
  // from a failed background refresh or one failed listener blocking the rest.
  try { void Promise.resolve(queryClient.refetchQueries({ type: 'active', stale: true })).catch(() => {}); } catch {}
  if (!current()) return;
  try { void Promise.resolve(queryClient.resumePausedMutations()).catch(() => {}); } catch {}
  for (const callback of [...reconnectListeners]) {
    if (!current()) return;
    try { callback(); } catch {}
  }
}

type Probe = { phase: ReadPhase; controller: AbortController; timer: number | null; retire: () => void };

/** The caller owns cleanup; duplicate installation cannot stop the first owner. */
export function startReconnectManager(queryClient: QueryClient): () => void {
  if (activeStop || typeof window === 'undefined') return () => {};
  let stopped = false;
  let pollTimer: number | null = null;
  let inFlight: Probe | null = null;
  let currentInterval = OFFLINE_MIN_MS;
  const foreground = () => foregroundReadPhaseCurrent(getForegroundReadPhase());
  const clearPoll = () => { if (pollTimer !== null) window.clearTimeout(pollTimer); pollTimer = null; };
  const retireProbe = () => {
    const old = inFlight; inFlight = null;
    if (!old) return;
    if (old.timer !== null) window.clearTimeout(old.timer);
    // Settle the owned wait even if a transport ignores AbortSignal.
    old.retire(); old.controller.abort();
  };
  const schedule = () => {
    clearPoll();
    if (stopped || !foreground()) return;
    pollTimer = window.setTimeout(() => { pollTimer = null; void check(); }, lastKnownOnline ? ONLINE_HEARTBEAT_MS : currentInterval);
  };
  const check = async () => {
    if (stopped || !foreground() || inFlight) return;
    clearPoll();
    let retire!: () => void;
    const retired = new Promise<null>(resolve => { retire = () => resolve(null); });
    const probe: Probe = { phase: getForegroundReadPhase(), controller: new AbortController(), timer: null, retire };
    inFlight = probe;
    const current = () => !stopped && inFlight === probe && foregroundReadPhaseCurrent(probe.phase);
    const deadline = new Promise<never>((_resolve, reject) => {
      probe.timer = window.setTimeout(() => { probe.controller.abort(); reject(new Error('Reachability check timed out')); }, PROBE_TIMEOUT_MS);
    });
    try {
      const native = isNativeAppShell();
      const target = native ? 'https://vybehub.app/favicon.ico' : '/favicon.ico';
      const response = await Promise.race([fetch(`${target}?_probe=${Date.now()}`, {
        method: 'HEAD', cache: 'no-store', credentials: 'omit', mode: native ? 'no-cors' : 'same-origin', signal: probe.controller.signal,
      }), deadline, retired]);
      if (!current() || !response) return;
      // A no-cors HTTPS response is opaque by design. It proves a completed
      // network request, not a readable status or backend-service success.
      const reachable = (native && response.type === 'opaque') || (response.status >= 200 && response.status < 500);
      if (reachable) {
        currentInterval = OFFLINE_MIN_MS;
        if (!lastKnownOnline) {
          lastKnownOnline = true;
          window.dispatchEvent(new CustomEvent('vybe:online'));
          if (current()) fireReconnect(queryClient, current);
        }
      } else if (lastKnownOnline) {
        lastKnownOnline = false; currentInterval = OFFLINE_MIN_MS;
        window.dispatchEvent(new CustomEvent('vybe:offline'));
      } else currentInterval = Math.min(currentInterval * 1.5, OFFLINE_MAX_MS);
    } catch {
      if (!current()) return;
      if (lastKnownOnline) {
        lastKnownOnline = false; currentInterval = OFFLINE_MIN_MS;
        window.dispatchEvent(new CustomEvent('vybe:offline'));
      } else currentInterval = Math.min(currentInterval * 1.5, OFFLINE_MAX_MS);
    } finally {
      if (probe.timer !== null) window.clearTimeout(probe.timer);
      if (inFlight === probe) { inFlight = null; schedule(); }
    }
  };
  const maybeOnline = () => { void check(); };
  const phaseChanged = () => { clearPoll(); retireProbe(); if (foreground()) void check(); };
  const unsubscribePhase = subscribeForegroundReadPhase(phaseChanged);
  const events = ['online', 'offline', 'focus', 'pageshow'] as const;
  for (const event of events) window.addEventListener(event, maybeOnline);
  const connection = (navigator as Navigator & { connection?: EventTarget }).connection;
  connection?.addEventListener('change', maybeOnline);
  const stop = () => {
    if (stopped) return;
    stopped = true; clearPoll(); retireProbe(); unsubscribePhase();
    for (const event of events) window.removeEventListener(event, maybeOnline);
    connection?.removeEventListener('change', maybeOnline);
    if (activeStop === stop) activeStop = null;
  };
  activeStop = stop;
  void check();
  return stop;
}

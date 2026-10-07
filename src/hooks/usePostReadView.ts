import { useEffect, useId, useRef, useState } from 'react';
import { useProfileAccount } from './useProfileAccount';
import { useForegroundReadPhase, foregroundReadPhaseCurrent } from './useForegroundReadPhase';

function leasesExpired(values: number[]): boolean {
  if (values.length === 0) return false;
  const now = Date.now();
  return values.some(value => !Number.isFinite(value) || value <= now);
}

/** A cache entry proves only a short, current visible read. Closing a surface,
 * changing account (including A→B→A), or pausing the app starts a new scope. */
export function usePostReadView(enabled: boolean) {
  const account = useProfileAccount(), mount = useId();
  const phase = useForegroundReadPhase();
  const toggle = useRef({ enabled, epoch: 0 });
  if (toggle.current.enabled !== enabled) toggle.current = { enabled, epoch: toggle.current.epoch + 1 };
  const current = useRef({ active: false, epoch: 0 });
  const active = enabled && account.ready && phase.foreground;
  const epoch = phase.generation + toggle.current.epoch;
  current.current = { active, epoch };
  const leases = useRef<number[]>([]);
  const leaseKey = useRef('');
  const [leaseExpired, setLeaseExpired] = useState(false);
  // Call during render with the leases this view is showing. The clock below
  // only re-renders when one of them actually expires, not every second.
  const observeLeases = (values: Array<number | null | undefined>) => {
    const normalized = values.map(value => (typeof value === 'number' ? value : Number.NaN));
    const key = normalized.join(',');
    leases.current = normalized;
    const expired = active && leasesExpired(normalized);
    if (leaseKey.current === key && expired === leaseExpired) return;
    leaseKey.current = key;
    if (expired !== leaseExpired) setLeaseExpired(expired);
  };
  useEffect(() => {
    current.current = { active, epoch };
    return () => { current.current.active = false; };
  }, []);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      const expired = leasesExpired(leases.current);
      setLeaseExpired(previous => (previous === expired ? previous : expired));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return { account, active, now: Date.now(), leaseExpired: active && leaseExpired, observeLeases, key: [account.session.uid, account.session.epoch, account.profile?.id, mount, epoch],
    guard: (signal?: AbortSignal) => { account.guard(); if (!foregroundReadPhaseCurrent(phase) || !current.current.active || current.current.epoch !== epoch || signal?.aborted) throw new DOMException('Post view closed. Reopen to retry.', 'AbortError'); } };
}

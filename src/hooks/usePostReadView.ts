import { useEffect, useId, useRef, useState } from 'react';
import { useProfileAccount } from './useProfileAccount';
import { useForegroundReadPhase, foregroundReadPhaseCurrent } from './useForegroundReadPhase';

/** A cache entry proves only a short, current visible read. Closing a surface,
 * changing account (including A→B→A), or pausing the app starts a new scope. */
export function usePostReadView(enabled: boolean) {
  const account = useProfileAccount(), mount = useId();
  const phase = useForegroundReadPhase();
  const [now, setNow] = useState(Date.now);
  const toggle = useRef({ enabled, epoch: 0 });
  if (toggle.current.enabled !== enabled) toggle.current = { enabled, epoch: toggle.current.epoch + 1 };
  const current = useRef({ active: false, epoch: 0 });
  const active = enabled && account.ready && phase.foreground;
  const epoch = phase.generation + toggle.current.epoch;
  current.current = { active, epoch };
  useEffect(() => {
    current.current = { active, epoch };
    return () => { current.current.active = false; };
  }, []);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return { account, active, now: Math.max(now, Date.now()), key: [account.session.uid, account.session.epoch, account.profile?.id, mount, epoch],
    guard: (signal?: AbortSignal) => { account.guard(); if (!foregroundReadPhaseCurrent(phase) || !current.current.active || current.current.epoch !== epoch || signal?.aborted) throw new DOMException('Post view closed. Reopen to retry.', 'AbortError'); } };
}

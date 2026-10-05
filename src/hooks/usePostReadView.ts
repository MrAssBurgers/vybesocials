import { useEffect, useId, useRef, useState } from 'react';
import { useProfileAccount } from './useProfileAccount';

/** A cache entry proves only a short, current visible read. Closing a surface,
 * changing account (including A→B→A), or hiding the page starts a new scope. */
export function usePostReadView(enabled: boolean) {
  const account = useProfileAccount(), mount = useId();
  const [view, setView] = useState({ visible: document.visibilityState !== 'hidden', epoch: 0, now: Date.now() });
  const toggle = useRef({ enabled, epoch: 0 });
  if (toggle.current.enabled !== enabled) toggle.current = { enabled, epoch: toggle.current.epoch + 1 };
  const current = useRef({ active: false, epoch: 0 });
  const active = enabled && account.ready && view.visible;
  const epoch = view.epoch + toggle.current.epoch;
  current.current = { active, epoch };
  useEffect(() => {
    current.current = { active, epoch };
    const visibility = () => { current.current = { active: false, epoch: current.current.epoch + 1 }; setView(value => ({ visible: document.visibilityState !== 'hidden', epoch: value.epoch + 1, now: Date.now() })); };
    document.addEventListener('visibilitychange', visibility);
    return () => { current.current.active = false; document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setView(value => ({ ...value, now: Date.now() })), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return { account, active, now: Math.max(view.now, Date.now()), key: [account.session.uid, account.session.epoch, account.profile?.id, mount, epoch],
    guard: (signal?: AbortSignal) => { account.guard(); if (!current.current.active || current.current.epoch !== epoch || signal?.aborted) throw new DOMException('Post view closed. Reopen to retry.', 'AbortError'); } };
}

import { useEffect, useRef, useState } from 'react';
import { useProfileAccount } from './useProfileAccount';
import { approximateLocalArea, type LocalArea } from '@/lib/localArea';

/** Explicit per-surface choice, memory only; late GPS callbacks cannot cross accounts. */
export function useApproximateLocation(enabled: boolean) {
  const account = useProfileAccount();
  const key = `${account.session.uid}:${account.session.epoch}:${account.profile?.id}:${enabled}:${account.ready}`;
  const lease = useRef({ key, generation: 0 });
  if (lease.current.key !== key) lease.current = { key, generation: lease.current.generation + 1 };
  const [state, setState] = useState<{ key: string; generation: number; location: LocalArea | null; pending: boolean; error: string | null }>({ key, generation: lease.current.generation, location: null, pending: false, error: null });
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    // Retire the old hook's precise, indefinitely persisted GPS cache.
    try { localStorage.removeItem('vybe-user-location'); } catch { /* storage may be disabled */ }
    const hide = () => {
      if (document.visibilityState === 'hidden') {
        lease.current.generation++;
        setState({ key: lease.current.key, generation: lease.current.generation, location: null, pending: false, error: null });
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => { mounted.current = false; lease.current.generation++; document.removeEventListener('visibilitychange', hide); };
  }, []);
  const clearLocation = () => {
    lease.current.generation++;
    setState({ key, generation: lease.current.generation, location: null, pending: false, error: null });
  };
  const requestLocation = () => {
    if (!enabled || !account.ready || document.visibilityState === 'hidden') return;
    const generation = ++lease.current.generation;
    const current = () => {
      if (!mounted.current || lease.current.key !== key || lease.current.generation !== generation || document.visibilityState === 'hidden') return false;
      try { account.guard(); return true; } catch { return false; }
    };
    setState({ key, generation: lease.current.generation, location: null, pending: true, error: null });
    const fail = (message: string) => { if (current()) setState({ key, generation: lease.current.generation, location: null, pending: false, error: message }); };
    if (!navigator.geolocation) { fail('Location is unavailable on this device.'); return; }
    try {
      navigator.geolocation.getCurrentPosition(position => {
        if (!current()) return;
        try { setState({ key, generation: lease.current.generation, location: approximateLocalArea(position.coords.latitude, position.coords.longitude), pending: false, error: null }); }
        catch { fail('Your location could not be read. Try again.'); }
      }, error => fail(error.code === 1 ? 'Location access is off. You can enable it in your browser settings and try again.' : 'Your location could not be read. Try again.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
    } catch { fail('Your location could not be read. Try again.'); }
  };
  const visible = enabled && account.ready && state.key === key && state.generation === lease.current.generation && document.visibilityState !== 'hidden';
  return { location: visible ? state.location : null, pending: visible && state.pending, error: visible ? state.error : null, requestLocation, clearLocation };
}

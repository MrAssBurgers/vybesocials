import { useEffect, useRef, useState } from 'react';
import { db } from '@/lib/firebase';
import { getAuthRestoreState } from '@/lib/firebase/authService';
import { hasStoredAuthSession } from '@/lib/legacyAuthStorage';
import { setWasLoggedIn } from '@/lib/wasLoggedIn';

/** Splash timing may expire; only a settled Auth read updates the saved sign-in hint. */
export function useAuthSplashStatus(optimistic: boolean, nativeMode: boolean) {
  const initial = useRef({ optimistic, nativeMode }).current;
  const [resolved, setResolved] = useState(optimistic), [hasSession, setHasSession] = useState(() => optimistic || hasStoredAuthSession());
  useEffect(() => {
    let cancelled = false, authEventRevision = 0;
    const { optimistic, nativeMode } = initial;
    const timeout = optimistic ? nativeMode ? 150 : 200 : hasStoredAuthSession() ? nativeMode ? 300 : 400 : nativeMode ? 600 : 700;
    const timer = setTimeout(() => { if (!cancelled) setResolved(true); }, timeout);
    if (hasStoredAuthSession()) { setHasSession(true); setWasLoggedIn(true); }
    void db.auth.getSession().then(({ data, error }) => {
      if (cancelled || authEventRevision !== 0 || error || getAuthRestoreState() !== 'ready') return;
      setHasSession(!!data.session); setWasLoggedIn(!!data.session); setResolved(true);
    }).catch(() => { /* The bounded splash may dismiss without erasing a restore hint. */ });
    const { data: { subscription } } = db.auth.onAuthStateChange((event, session) => {
      if (cancelled || (!session && getAuthRestoreState() !== 'ready')) return;
      authEventRevision++;
      setHasSession(!!session);
      if (session || event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') setWasLoggedIn(!!session);
      setResolved(true);
    });
    return () => { cancelled = true; clearTimeout(timer); subscription.unsubscribe(); };
  }, [initial]);
  return { authResolved: resolved, hasSession };
}

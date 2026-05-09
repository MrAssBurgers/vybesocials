import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isDespia, requestBioAuth, getBioAuthPref } from '@/lib/despiaBiometrics';
import { toast } from 'sonner';

/**
 * App-launch biometric gate for Despia native shell.
 * - Only runs when isDespia() && getBioAuthPref() && a session exists.
 * - Blocks the UI on cold start and on resume (>2 min in background).
 * - On failure / cancel: signs the user out and routes to /auth.
 * - On 'unavailable': unblocks with a one-time hint toast.
 *
 * Returns `locked` so the root layout can render a full-screen blocker.
 */
export function useBiometricLoginGate() {
  const [locked, setLocked] = useState(false);
  const lastHiddenAtRef = useRef<number>(0);
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (!isDespia()) return;

    const verify = async () => {
      if (verifyingRef.current) return;
      if (!getBioAuthPref()) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;

      verifyingRef.current = true;
      setLocked(true);
      try {
        const r = await requestBioAuth();
        if (r.ok) {
          setLocked(false);
        } else if ((r as any).reason === 'unavailable') {
          toast.message('Biometrics unavailable on this device — unlocked.');
          setLocked(false);
        } else {
          await supabase.auth.signOut().catch(() => {});
          setLocked(false);
          window.location.replace('/auth');
        }
      } finally {
        verifyingRef.current = false;
      }
    };

    // Cold start
    verify();

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenAtRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        const awayMs = Date.now() - lastHiddenAtRef.current;
        if (lastHiddenAtRef.current > 0 && awayMs > 2 * 60 * 1000) {
          verify();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return locked;
}

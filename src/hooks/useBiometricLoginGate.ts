import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isBiometricsAvailable, requestBioAuth, getBioAuthPref, setBioAuthPref } from '@/lib/biometrics';
import { toast } from 'sonner';

/**
 * App-launch biometric gate. Works in Capacitor (iOS/Android) and Despia.
 * - Only runs when biometrics are actually available, the user opted in, and
 *   a Supabase session exists.
 * - Blocks the UI on cold start and on resume (>2 min in background).
 * - On failure / cancel: signs the user out and routes to /auth.
 * - On 'unavailable': unblocks with a one-time hint toast.
 */
export function useBiometricLoginGate() {
  const [locked, setLocked] = useState(false);
  const lastHiddenAtRef = useRef<number>(0);
  const verifyingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const verify = async () => {
      if (verifyingRef.current) return;
      if (!getBioAuthPref()) return;
      const available = await isBiometricsAvailable();
      if (!available) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;

      verifyingRef.current = true;
      if (!cancelled) setLocked(true);
      try {
        const r = await requestBioAuth();
        if (r.ok) {
          if (!cancelled) setLocked(false);
        } else if ((r as any).reason === 'unavailable' || (r as any).reason === 'not-enrolled') {
          // Hardware gone or biometrics removed — turn pref off, don't lock the user out.
          setBioAuthPref(false);
          toast.message('Biometric lock turned off — re-enable in Settings → Security.');
          if (!cancelled) setLocked(false);
        } else if ((r as any).reason === 'cancelled') {
          // Resume gate: leave locked so they retry. Cold start: sign out.
          if (lastHiddenAtRef.current === 0) {
            await supabase.auth.signOut().catch(() => {});
            if (!cancelled) setLocked(false);
            window.location.replace('/auth');
          }
        } else {
          await supabase.auth.signOut().catch(() => {});
          if (!cancelled) setLocked(false);
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
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return locked;
}

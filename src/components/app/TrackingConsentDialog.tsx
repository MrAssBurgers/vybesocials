import { useState, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { syncNativeTrackingConsent, TRACKING_CONSENT_KEY, pollNativeTrackingConsent } from '@/lib/att';
import { ATT_RESUME_EVENT } from '@/lib/attResumeRecovery';

export type TrackingConsent = 'allowed' | 'denied' | null;

export function getTrackingConsent(): TrackingConsent {
  try {
    return localStorage.getItem(TRACKING_CONSENT_KEY) as TrackingConsent;
  } catch {
    return null;
  }
}

export function isTrackingAllowed(): boolean {
  return getTrackingConsent() === 'allowed';
}

/** Web-only supplemental consent. Native uses system ATT via Despia — no duplicate dialog. */
export const TrackingConsentDialog = memo(function TrackingConsentDialog() {
  const [visible, setVisible] = useState(false);
  const { profile } = useAuth();

  useEffect(() => {
    if (isDespiaRuntime()) {
      syncNativeTrackingConsent();
      const onResume = () => {
        syncNativeTrackingConsent();
        pollNativeTrackingConsent();
      };
      window.addEventListener(ATT_RESUME_EVENT, onResume);
      return () => window.removeEventListener(ATT_RESUME_EVENT, onResume);
    }

    if (getTrackingConsent()) return undefined;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedulePrompt = () => {
      timer = setTimeout(() => {
        if (!cancelled) setVisible(true);
      }, 2000);
    };

    if (profile?.id) {
      supabase
        .rpc('get_own_sensitive_profile')
        .single()
        .then(
          ({ data }) => {
            if (cancelled) return;
            if (data?.tracking_consent) {
              localStorage.setItem(TRACKING_CONSENT_KEY, data.tracking_consent);
            } else {
              schedulePrompt();
            }
          },
          () => {
            if (!cancelled) schedulePrompt();
          },
        );
    }

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [profile?.id]);

  const handleResponse = async (consent: 'allowed' | 'denied') => {
    localStorage.setItem(TRACKING_CONSENT_KEY, consent);
    setVisible(false);

    if (profile?.id) {
      await supabase
        .from('profiles')
        .update({ tracking_consent: consent } as Record<string, string>)
        .eq('id', profile.id);
    }
  };

  if (isDespiaRuntime()) return null;

  return (
    <AnimatePresence>
      {visible && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999]"
            onClick={() => handleResponse('denied')}
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-0 flex items-center justify-center z-[10000] px-6 pointer-events-none"
          >
            <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl pointer-events-auto">
              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Shield className="w-7 h-7 text-primary" />
                </div>
              </div>

              <h2 className="text-lg font-bold text-center text-foreground mb-2">
                Allow &quot;VYBE&quot; to track your activity?
              </h2>

              <p className="text-sm text-muted-foreground text-center mb-6 leading-relaxed">
                Your data will be used to personalize your feed, improve recommendations, and show relevant ads. We do not sell your data to third parties. VYBE+ members enjoy an ad-free experience.
              </p>

              <div className="flex flex-col gap-2.5">
                <Button
                  onClick={() => handleResponse('allowed')}
                  className="w-full rounded-xl h-11 font-semibold"
                >
                  Allow Tracking
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => handleResponse('denied')}
                  className="w-full rounded-xl h-11 font-semibold text-muted-foreground"
                >
                  Ask App Not to Track
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

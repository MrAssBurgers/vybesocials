import { useState, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';

const TRACKING_CONSENT_KEY = 'vybe_tracking_consent';

export type TrackingConsent = 'allowed' | 'denied' | null;

export function getTrackingConsent(): TrackingConsent {
  return localStorage.getItem(TRACKING_CONSENT_KEY) as TrackingConsent;
}

export function isTrackingAllowed(): boolean {
  return getTrackingConsent() === 'allowed';
}

export const TrackingConsentDialog = memo(function TrackingConsentDialog() {
  const [visible, setVisible] = useState(false);
  const { profile } = useAuth();

  useEffect(() => {
    // If already answered locally, skip
    if (getTrackingConsent()) return;

    // If logged in, check DB first
    if (profile?.id) {
      supabase
        .rpc('get_own_sensitive_profile')
        .single()
        .then(({ data }) => {
          if (data?.tracking_consent) {
            localStorage.setItem(TRACKING_CONSENT_KEY, data.tracking_consent);
          } else {
            const timer = setTimeout(() => setVisible(true), 2000);
            return () => clearTimeout(timer);
          }
        });
      return;
    }

    // Not logged in — don't show tracking dialog until they have an account
    return;
  }, [profile?.id]);

  const handleResponse = async (consent: 'allowed' | 'denied') => {
    localStorage.setItem(TRACKING_CONSENT_KEY, consent);
    setVisible(false);

    // Persist to DB so it never asks again on any device
    if (profile?.id) {
      await supabase
        .from('profiles')
        .update({ tracking_consent: consent } as any)
        .eq('id', profile.id);
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999]"
            onClick={() => handleResponse('denied')}
          />

          {/* Dialog */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="fixed inset-0 flex items-center justify-center z-[10000] px-6 pointer-events-none"
          >
            <div className="bg-card border border-border rounded-2xl p-6 max-w-sm w-full shadow-2xl pointer-events-auto">
              {/* Icon */}
              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Shield className="w-7 h-7 text-primary" />
                </div>
              </div>

              {/* Title */}
              <h2 className="text-lg font-bold text-center text-foreground mb-2">
                Allow "VYBE" to track your activity?
              </h2>

              {/* Description */}
              <p className="text-sm text-muted-foreground text-center mb-6 leading-relaxed">
                Your data will be used to personalize your feed, improve recommendations, and show relevant ads. We do not sell your data to third parties. VYBE+ members enjoy an ad-free experience.
              </p>

              {/* Buttons */}
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

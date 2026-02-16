import { useState, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

  useEffect(() => {
    // Only show if user hasn't responded yet
    if (!getTrackingConsent()) {
      // Small delay so it doesn't compete with splash screen
      const timer = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleResponse = (consent: 'allowed' | 'denied') => {
    localStorage.setItem(TRACKING_CONSENT_KEY, consent);
    setVisible(false);
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
                Your data will be used to personalize your feed, improve recommendations, and deliver a better experience. We do not sell your data to third parties.
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

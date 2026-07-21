import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { db } from '@/lib/firebase';
import { isNativeAppShell } from '@/lib/despiaBridge';
import {
  pollNativeTrackingConsent,
  syncNativeTrackingConsent,
  TRACKING_CONSENT_KEY,
} from '@/lib/att';

const COOKIE_CONSENT_KEY = 'vybe-cookie-consent';

/**
 * Web-only cookie notice.
 *
 * Native store shells (Despia + Capacitor): never show a cookie banner —
 * ATT / OS privacy is the sole tracking prompt (App Review 5.1.1(iv)).
 * Mobile Safari/Chrome web still sees this banner. Until ATT is allowed on
 * native, storage stays essential-only (no advertising cookies).
 */
export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const { profile } = useAuth();

  useEffect(() => {
    if (isNativeAppShell()) {
      const applyEssentialOnly = () => {
        try {
          localStorage.setItem(COOKIE_CONSENT_KEY, 'declined');
          localStorage.setItem(TRACKING_CONSENT_KEY, 'denied');
        } catch { /* ignore */ }
      };

      const att = syncNativeTrackingConsent();
      if (att === 'allowed') {
        try {
          if (!localStorage.getItem(COOKIE_CONSENT_KEY)) {
            localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
          }
        } catch { /* ignore */ }
        return;
      }

      // denied, or ATT not readable yet — default essential-only; never show banner.
      applyEssentialOnly();
      const stopPoll = pollNativeTrackingConsent(4000, 200);
      const onResume = () => {
        const next = syncNativeTrackingConsent();
        if (next === 'allowed') {
          try {
            localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
            localStorage.setItem(TRACKING_CONSENT_KEY, 'allowed');
          } catch { /* ignore */ }
        } else {
          applyEssentialOnly();
        }
      };
      window.addEventListener('vybe:resume-recover', onResume);
      return () => {
        stopPoll();
        window.removeEventListener('vybe:resume-recover', onResume);
      };
    }

    if (localStorage.getItem(COOKIE_CONSENT_KEY)) return;

    if (profile?.id) {
      let cancelled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      db
        .rpc('get_own_sensitive_profile')
        .single()
        .then(({ data }) => {
          if (cancelled) return;
          const dbVal = (data as { cookie_consent?: string } | null)?.cookie_consent;
          if (dbVal === 'accepted' || dbVal === 'declined') {
            localStorage.setItem(COOKIE_CONSENT_KEY, dbVal);
          } else {
            timer = setTimeout(() => setVisible(true), 2000);
          }
        });
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
      };
    }

    const timer = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(timer);
  }, [profile?.id]);

  const persist = async (value: 'accepted' | 'declined') => {
    localStorage.setItem(COOKIE_CONSENT_KEY, value);
    if (value === 'declined') {
      localStorage.setItem(TRACKING_CONSENT_KEY, 'denied');
    } else {
      localStorage.setItem(TRACKING_CONSENT_KEY, 'allowed');
    }
    setVisible(false);
    if (profile?.id) {
      await db
        .from('profiles')
        .update({ cookie_consent: value } as any)
        .eq('id', profile.id);
    }
  };

  // Native store shell never mounts the cookie UI (Despia or Capacitor).
  if (isNativeAppShell()) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-sm z-[9999]"
        >
          <div className="rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Cookie className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Essential storage only</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  VYBE uses essential storage to keep you signed in. We do not use advertising cookies
                  or track you across other companies&apos; apps or websites unless you later allow
                  that in your browser settings.{' '}
                  <Link to="/cookies" className="text-primary hover:underline" onClick={() => setVisible(false)}>
                    Learn about our cookie policy
                  </Link>
                </p>
              </div>
              <button
                onClick={() => persist('declined')}
                aria-label="Dismiss cookie notice"
                className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => persist('declined')}
                className="flex-1 px-3 py-2 rounded-xl text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

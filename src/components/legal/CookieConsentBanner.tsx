import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';

const COOKIE_CONSENT_KEY = 'vybe-cookie-consent';

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const { profile } = useAuth();

  useEffect(() => {
    // Already answered locally — done
    if (localStorage.getItem(COOKIE_CONSENT_KEY)) return;

    // If logged in, check DB first so the choice follows them across devices
    if (profile?.id) {
      supabase
        .rpc('get_own_sensitive_profile')
        .single()
        .then(({ data }) => {
          const dbVal = (data as any)?.cookie_consent;
          if (dbVal === 'accepted' || dbVal === 'declined') {
            localStorage.setItem(COOKIE_CONSENT_KEY, dbVal);
          } else {
            const timer = setTimeout(() => setVisible(true), 2000);
            return () => clearTimeout(timer);
          }
        });
      return;
    }

    // Not logged in — show banner after short delay
    const timer = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(timer);
  }, [profile?.id]);

  const persist = async (value: 'accepted' | 'declined') => {
    localStorage.setItem(COOKIE_CONSENT_KEY, value);
    setVisible(false);
    if (profile?.id) {
      await supabase
        .from('profiles')
        .update({ cookie_consent: value } as any)
        .eq('id', profile.id);
    }
  };

  const handleAccept = () => persist('accepted');
  const handleDecline = () => persist('declined');

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
                <p className="text-sm font-semibold text-foreground">We use cookies</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  We use essential cookies to keep VYBE running and optional cookies to improve your experience.{' '}
                  <Link to="/cookies" className="text-primary hover:underline" onClick={() => setVisible(false)}>
                    Learn more
                  </Link>
                </p>
              </div>
              <button onClick={handleDecline} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={handleDecline}
                className="flex-1 px-3 py-2 rounded-xl text-xs font-medium border border-border text-muted-foreground hover:bg-muted transition-colors">
                Essential only
              </button>
              <button onClick={handleAccept}
                className="flex-1 px-3 py-2 rounded-xl text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                Accept all
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

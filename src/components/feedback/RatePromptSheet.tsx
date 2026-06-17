import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { openRateApp, dismissRatePrompt, shouldShowRatePrompt, markRatePromptShown } from '@/lib/rateApp';
import { haptics } from '@/lib/haptics';

const SESSION_COUNT_KEY = 'vybe_session_count';
const LAST_SHOWN_LOCK_KEY = 'vybe_rate_prompt_last_shown_at';

function bumpSessionCount(): number {
  try {
    const n = parseInt(localStorage.getItem(SESSION_COUNT_KEY) || '0', 10) + 1;
    localStorage.setItem(SESSION_COUNT_KEY, String(n));
    return n;
  } catch { return 0; }
}

/**
 * Lightweight, never-spammy "Rate VYBE" prompt.
 * Triggers only when:
 *  - user is authenticated
 *  - they've opened the app at least 3 times
 *  - they haven't already rated or recently dismissed
 *  - we're not in the middle of a chat / call / camera flow (route check)
 */
export function RatePromptSheet() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!profile?.id) return;
    // The Play Store rating flow only makes sense inside the Android app shell.
    if (!/android/i.test(navigator.userAgent || '')) return;
    if (!shouldShowRatePrompt()) return;

    // Throttle: never re-prompt within 24h even if user closed without choosing.
    try {
      const last = parseInt(localStorage.getItem(LAST_SHOWN_LOCK_KEY) || '0', 10);
      if (last && Date.now() - last < 24 * 60 * 60 * 1000) return;
    } catch { /* ignore */ }

    const sessions = bumpSessionCount();
    if (sessions < 3) return;

    // Avoid sensitive routes
    const path = window.location.pathname;
    if (/\/(messages|call|camera|story|clip|auth|intro)/i.test(path)) return;

    const t = window.setTimeout(() => {
      try { localStorage.setItem(LAST_SHOWN_LOCK_KEY, String(Date.now())); } catch {}
      markRatePromptShown();
      setOpen(true);
    }, 12000); // give the user 12s to settle into the app
    return () => window.clearTimeout(t);
  }, [profile?.id]);

  const handleRate = () => {
    haptics.success();
    openRateApp();
    setOpen(false);
  };

  const handleSnooze = () => {
    haptics.tap();
    dismissRatePrompt(14);
    setOpen(false);
  };

  const handleNever = () => {
    haptics.tap();
    dismissRatePrompt(365 * 5); // effectively never
    setOpen(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9000] flex items-end justify-center sm:items-center bg-background/60 backdrop-blur-sm p-4"
          onClick={handleSnooze}
        >
          <motion.div
            initial={{ y: 80, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 80, opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm rounded-3xl bg-card border border-border p-6 shadow-2xl"
          >
            <button
              onClick={handleSnooze}
              aria-label="Close"
              className="absolute top-3 right-3 p-2 rounded-full hover:bg-muted/60 active:scale-95 transition"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>

            <div className="flex flex-col items-center text-center">
              <div className="relative mb-4">
                <div className="absolute -inset-3 rounded-2xl bg-gradient-to-br from-amber-400/30 to-orange-500/20 blur-xl" />
                <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                  <Star className="w-7 h-7 text-white fill-white" />
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-1">Enjoying VYBE?</h3>
              <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                A quick rating on the Play Store helps a ton — it's how more people find us and helps us keep building.
              </p>

              <Button
                onClick={handleRate}
                className="w-full h-11 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 text-white font-semibold shadow-lg shadow-amber-500/30 active:scale-[0.98]"
              >
                <Star className="w-4 h-4 mr-1.5 fill-white" />
                Rate VYBE
              </Button>
              <button
                onClick={handleSnooze}
                className="mt-3 text-sm text-muted-foreground hover:text-foreground transition"
              >
                Maybe later
              </button>
              <button
                onClick={handleNever}
                className="mt-1 text-xs text-muted-foreground/70 hover:text-foreground/80 transition"
              >
                Don't ask again
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

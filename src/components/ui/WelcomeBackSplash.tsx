import { memo, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { Avatar, AvatarFallback, ProfileAvatarImage } from '@/components/ui/avatar';

interface WelcomeBackSplashProps {
  username?: string | null;
  avatarUrl?: string | null;
  profileId?: string | null;
  onComplete: () => void;
}

/**
 * A lightweight post-auth acknowledgement.
 *
 * This intentionally does not cover the page or lock scrolling: after OAuth,
 * the fastest-feeling experience is to reveal the destination immediately.
 */
export const WelcomeBackSplash = memo(function WelcomeBackSplash({
  username,
  avatarUrl,
  profileId,
  onComplete,
}: WelcomeBackSplashProps) {
  const [visible, setVisible] = useState(true);
  const [holdingForAuth, setHoldingForAuth] = useState(
    () => typeof document !== 'undefined' && !!document.querySelector('[data-auth-shell]'),
  );
  const displayName = username || 'you';

  useEffect(() => {
    if (!holdingForAuth) return;
    const id = window.setInterval(() => {
      if (!document.querySelector('[data-auth-shell]')) setHoldingForAuth(false);
    }, 120);
    return () => window.clearInterval(id);
  }, [holdingForAuth]);

  useEffect(() => {
    if (holdingForAuth) return;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setVisible(false), reducedMotion ? 900 : 1800);
    return () => window.clearTimeout(timer);
  }, [holdingForAuth]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence onExitComplete={onComplete}>
      {visible && !holdingForAuth && (
        <motion.aside
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: -18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="fixed inset-x-0 z-[10000] mx-auto w-[min(92vw,360px)] pointer-events-auto"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
        >
          <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card/95 backdrop-blur-xl shadow-2xl shadow-primary/15">
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent"
            />
            <div className="flex items-center gap-3 px-3.5 py-3 pr-11">
              <Avatar className="h-11 w-11 ring-2 ring-primary/25">
                <ProfileAvatarImage
                  profileId={profileId}
                  src={avatarUrl}
                  priority
                  transformSize={96}
                  alt=""
                />
                <AvatarFallback className="bg-primary/10 text-primary font-bold">
                  {displayName[0]?.toUpperCase() || 'V'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Sparkles aria-hidden className="h-4 w-4 text-primary" />
                  <p className="font-semibold text-foreground">Welcome back</p>
                </div>
                <p className="truncate text-sm text-muted-foreground">@{displayName}</p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Dismiss welcome message"
              onClick={() => setVisible(false)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>,
    document.body,
  );
});

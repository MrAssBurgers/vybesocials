import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Vibrate } from 'lucide-react';
import { hasSeenFriendLinkActivateHint, markFriendLinkActivateHintSeen } from '@/lib/friendLinkHints';

interface FriendLinkActivateHintProps {
  /** Called on dismiss so iOS can enable shake (needs a user gesture). */
  onEnableShake?: () => void | Promise<void>;
}

/** Coach mark above the Friend Link pill — how to open it. */
export function FriendLinkActivateHint({ onEnableShake }: FriendLinkActivateHintProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasSeenFriendLinkActivateHint()) {
      setVisible(true);
      const t = setTimeout(() => {
        setVisible(false);
        markFriendLinkActivateHintSeen();
      }, 8000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, []);

  const dismiss = () => {
    void onEnableShake?.();
    setVisible(false);
    markFriendLinkActivateHintSeen();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 6, scale: 0.98 }}
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-[min(280px,calc(100vw-2rem))] pointer-events-auto"
        >
          <div className="rounded-2xl border border-primary/30 bg-card/95 backdrop-blur-xl shadow-xl px-4 py-3 text-left">
            <p className="text-[10px] font-bold uppercase tracking-wider text-primary mb-2">
              How to open Friend Link
            </p>
            <div className="space-y-2">
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <Smartphone className="h-4 w-4 text-primary" />
                </div>
                <p className="text-xs text-foreground leading-snug pt-0.5">
                  <span className="font-semibold">Tap</span> the Friend Link button below
                </p>
              </div>
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
                  <Vibrate className="h-4 w-4 text-primary" />
                </div>
                <p className="text-xs text-foreground leading-snug pt-0.5">
                  <span className="font-semibold">Shake</span> your phone on Home — quick back-and-forth bump
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="mt-3 w-full text-center text-[11px] font-semibold text-primary"
            >
              Got it
            </button>
          </div>
          <div className="mx-auto mt-1 h-2 w-2 rotate-45 bg-card/95 border-r border-b border-primary/20" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Always-visible tips inside the Friend Link sheet. */
export function FriendLinkSheetTips() {
  return (
    <div className="mx-4 mb-3 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-primary/90 mb-1.5">
        Quick open (on Home)
      </p>
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        <span className="font-medium text-foreground">Tap</span> the Friend Link pill at the bottom, or{' '}
        <span className="font-medium text-foreground">shake</span> your phone like a quick bump.
      </p>
    </div>
  );
}

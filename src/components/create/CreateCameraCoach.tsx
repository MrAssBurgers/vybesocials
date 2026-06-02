import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { hasSeenCreateCameraCoach, markCreateCameraCoachSeen } from '@/lib/friendLinkHints';

/** One-time coach for the revamped create camera layout. */
export function CreateCameraCoach() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasSeenCreateCameraCoach()) {
      const t = setTimeout(() => setVisible(true), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  }, []);

  const dismiss = () => {
    setVisible(false);
    markCreateCameraCoachSeen();
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          className="absolute top-20 left-4 right-4 z-[45] pointer-events-auto"
        >
          <div className="mx-auto max-w-sm rounded-2xl border border-white/20 bg-black/75 backdrop-blur-xl p-4 shadow-2xl">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="text-sm font-bold text-white">New VYBE Camera</p>
              </div>
              <button
                type="button"
                onClick={dismiss}
                className="p-1 rounded-full hover:bg-white/10"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4 text-white/70" />
              </button>
            </div>
            <ul className="text-xs text-white/75 space-y-1.5 leading-relaxed">
              <li>
                <span className="text-white font-medium">Lenses</span> — swipe the row above the shutter
              </li>
              <li>
                <span className="text-white font-medium">AR FX</span> — face filters that track you
              </li>
              <li>
                <span className="text-white font-medium">Modes</span> — Photo, Video, Multi at the bottom
              </li>
              <li>Tap shutter for photo · Hold for video · Pinch to zoom</li>
            </ul>
            <button
              type="button"
              onClick={dismiss}
              className="mt-3 w-full py-2 rounded-full bg-white/15 text-white text-xs font-bold"
            >
              Let&apos;s go
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

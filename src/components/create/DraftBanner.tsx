import { motion, AnimatePresence } from 'framer-motion';
import { FileText, X } from 'lucide-react';

interface DraftBannerProps {
  show: boolean;
  preview?: string;
  hadMedia?: boolean;
  onResume: () => void;
  onDismiss: () => void;
}

/**
 * Slim "you have a draft saved" banner shown at the top of a composer.
 * Tapping resume restores the saved caption/tags/visibility.
 */
export function DraftBanner({ show, preview, hadMedia, onResume, onDismiss }: DraftBannerProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="overflow-hidden"
        >
          <div className="mx-3 my-2 flex items-center gap-2.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <button
              type="button"
              onClick={onResume}
              className="flex-1 text-left active:opacity-70"
            >
              <p className="text-xs font-semibold text-primary">Draft · Tap to resume</p>
              <p className="text-[11px] text-muted-foreground line-clamp-1">
                {preview?.trim() || (hadMedia ? 'Saved post (re-attach media)' : 'Saved post')}
              </p>
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/40"
              aria-label="Dismiss draft"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

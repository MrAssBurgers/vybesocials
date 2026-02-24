import { Bug, X, Send, Loader2, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBugBountyDetector } from '@/hooks/useBugBountyDetector';

export function BugBountyOverlay() {
  const { pendingBug, isReporting, reportBug, dismissBug } = useBugBountyDetector();

  return (
    <AnimatePresence>
      {pendingBug && (
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.95 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="fixed bottom-20 left-4 right-4 z-[9999] mx-auto max-w-sm"
        >
          <div className="relative bg-card border border-border rounded-2xl p-5 shadow-xl overflow-hidden">
            {/* Decorative glow */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
            
            {/* Close button */}
            <button
              onClick={dismissBug}
              className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>

            {/* Header */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Bug className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  You found a bug!
                  <Sparkles className="w-4 h-4 text-yellow-500" />
                </h3>
                <p className="text-xs text-muted-foreground">
                  Report it to earn <span className="font-bold text-primary">+500 XP</span>
                </p>
              </div>
            </div>

            {/* Error preview */}
            <div className="bg-muted/50 rounded-lg p-2.5 mb-4">
              <p className="text-xs text-muted-foreground font-mono line-clamp-2 break-all">
                {pendingBug.message.substring(0, 150)}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={reportBug}
                disabled={isReporting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {isReporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Reporting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Report Bug
                  </>
                )}
              </button>
              <button
                onClick={dismissBug}
                className="px-4 py-2.5 bg-secondary text-secondary-foreground rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Skip
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

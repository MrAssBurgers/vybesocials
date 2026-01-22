import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

export function ProfileRetryBanner() {
  const { user, profile, profileLoading, refreshProfile, authPhase } = useAuth();
  const [isRetrying, setIsRetrying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Only show if: authenticated, no profile, not currently loading, not dismissed
  const shouldShow = authPhase === 'authenticated' && user && !profile && !profileLoading && !dismissed;

  const handleRetry = useCallback(async () => {
    setIsRetrying(true);
    try {
      await refreshProfile();
    } finally {
      setIsRetrying(false);
    }
  }, [refreshProfile]);

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-0 left-0 right-0 z-50 p-2 safe-area-inset-top"
        >
          <div className="max-w-md mx-auto bg-destructive/90 backdrop-blur-sm rounded-lg shadow-lg border border-destructive-foreground/20 p-3">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-destructive-foreground flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-destructive-foreground">
                  Profile failed to load
                </p>
                <p className="text-xs text-destructive-foreground/80">
                  Tap retry to load your profile
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="h-8 px-3"
                >
                  {isRetrying ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Retry
                    </>
                  )}
                </Button>
                <button
                  onClick={() => setDismissed(true)}
                  className="p-1 hover:bg-destructive-foreground/10 rounded"
                >
                  <X className="h-4 w-4 text-destructive-foreground/60" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

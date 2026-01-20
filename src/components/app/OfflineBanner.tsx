/**
 * Offline Banner
 * 
 * Shows a banner when the user loses connection with:
 * - Visual indicator of offline state
 * - Automatic retry when connection is restored
 * - Manual retry button
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, RefreshCw, CheckCircle, Wifi } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useQueryClient } from '@tanstack/react-query';

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();
  const queryClient = useQueryClient();
  const [showBanner, setShowBanner] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);
  const wasOfflineRef = useRef(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Track when we go offline
  useEffect(() => {
    if (!isOnline) {
      wasOfflineRef.current = true;
      setShowBanner(true);
      setJustReconnected(false);
    } else if (wasOfflineRef.current) {
      // Just came back online
      handleReconnect();
    }
  }, [isOnline]);

  // Auto-retry when connection is restored
  const handleReconnect = useCallback(async () => {
    setIsRetrying(true);
    setJustReconnected(true);
    
    try {
      // Invalidate stale queries to trigger refetch
      await queryClient.invalidateQueries();
      
      // Show success state briefly
      setTimeout(() => {
        setShowBanner(false);
        setJustReconnected(false);
        wasOfflineRef.current = false;
      }, 2000);
    } catch (error) {
      console.error('[Offline] Retry failed:', error);
    } finally {
      setIsRetrying(false);
    }
  }, [queryClient]);

  // Manual retry
  const handleManualRetry = useCallback(() => {
    if (isRetrying) return;
    
    // Check if actually online now
    if (navigator.onLine) {
      handleReconnect();
    } else {
      // Briefly shake or indicate still offline
      setIsRetrying(true);
      setTimeout(() => setIsRetrying(false), 500);
    }
  }, [isRetrying, handleReconnect]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-0 left-0 right-0 z-[100] safe-area-inset-top"
        >
          <div 
            className={`
              mx-2 mt-2 px-4 py-3 rounded-xl shadow-lg backdrop-blur-md
              flex items-center justify-between gap-3
              ${justReconnected 
                ? 'bg-emerald-500/90 text-white' 
                : 'bg-destructive/90 text-destructive-foreground'
              }
            `}
          >
            <div className="flex items-center gap-3">
              {justReconnected ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 15 }}
                >
                  <CheckCircle className="w-5 h-5" />
                </motion.div>
              ) : (
                <WifiOff className="w-5 h-5" />
              )}
              
              <div className="flex flex-col">
                <span className="font-medium text-sm">
                  {justReconnected ? 'Back online!' : 'No connection'}
                </span>
                <span className="text-xs opacity-80">
                  {justReconnected 
                    ? 'Syncing your data...' 
                    : 'Some features may not work'
                  }
                </span>
              </div>
            </div>

            {!justReconnected && (
              <button
                onClick={handleManualRetry}
                disabled={isRetrying}
                className="
                  p-2 rounded-lg bg-white/20 hover:bg-white/30 
                  transition-colors disabled:opacity-50
                "
                aria-label="Retry connection"
              >
                <RefreshCw 
                  className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} 
                />
              </button>
            )}

            {justReconnected && isRetrying && (
              <Wifi className="w-5 h-5 animate-pulse" />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

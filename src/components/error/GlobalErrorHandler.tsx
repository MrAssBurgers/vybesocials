import { useEffect } from 'react';
import { useErrorReporter } from '@/hooks/useErrorReporter';
import { useAutoBugReporter } from '@/hooks/useAutoBugReporter';
import { toast } from 'sonner';
import { trackError, clearAppCache } from '@/lib/selfHealingMonitor';

export function GlobalErrorHandler() {
  useErrorReporter();
  useAutoBugReporter();

  useEffect(() => {
    let lastState: 'online' | 'offline' = navigator.onLine ? 'online' : 'offline';
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let lastToastAt = 0;
    let suppressUntil = Date.now() + 5000;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        suppressUntil = Date.now() + 4000;
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    const emit = (next: 'online' | 'offline') => {
      if (next === lastState) return;
      lastState = next;
      const now = Date.now();
      if (now < suppressUntil) return;
      if (now - lastToastAt < 8000) return;
      lastToastAt = now;
      if (next === 'online') {
        toast.success('Back online', { description: 'Your connection has been restored.', id: 'net-status' });
      }
    };

    const schedule = (next: 'online' | 'offline') => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => emit(next), 1500);
    };

    const handleOnline = () => schedule('online');
    const handleOffline = () => schedule('offline');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Handle chunk loading errors
    const handleChunkError = (event: ErrorEvent) => {
      if (event.message?.includes('Loading chunk') || event.message?.includes('Failed to fetch')) {
        toast.error('Update available! 🔄', {
          description: 'Refreshing to get the latest version...',
          duration: 2000,
        });
        clearAppCache();
        setTimeout(() => window.location.reload(), 2000);
      }
    };

    // Track all errors for pattern detection
    const handleAllErrors = (event: ErrorEvent) => {
      if (event.message) {
        trackError(event.message);
      }
    };

    // Track unhandled promise rejections
    const handleRejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.isAuthGuard) return;
      const msg = event.reason?.message || event.reason?.toString() || '';
      if (msg === 'Not authenticated') return;
      if (msg) trackError(msg);
    };

    window.addEventListener('error', handleChunkError);
    window.addEventListener('error', handleAllErrors);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('error', handleAllErrors);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}

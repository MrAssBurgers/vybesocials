import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useErrorReporter } from '@/hooks/useErrorReporter';
import { useAutoBugReporter } from '@/hooks/useAutoBugReporter';
import { toast } from 'sonner';
import { trackError, clearAppCache } from '@/lib/selfHealingMonitor';

export function GlobalErrorHandler() {
  useErrorReporter();
  useAutoBugReporter();
  const queryClient = useQueryClient();

  useEffect(() => {
    // No online/offline toasts — silent background reconnect.
    // Reconnect logic still runs via reconnectManager; we just don't surface UI.

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
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('error', handleAllErrors);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}

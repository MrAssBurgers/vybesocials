import { useEffect } from 'react';
import { useErrorReporter } from '@/hooks/useErrorReporter';
import { toast } from 'sonner';
import { trackError, clearAppCache } from '@/lib/selfHealingMonitor';

export function GlobalErrorHandler() {
  useErrorReporter();

  useEffect(() => {
    const handleOnline = () => {
      toast.success('Back online! 🌐', {
        description: 'Your connection has been restored.',
      });
    };

    const handleOffline = () => {
      toast.error("You're offline 📡", {
        description: 'Check your internet connection.',
      });
    };

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
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('error', handleAllErrors);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}

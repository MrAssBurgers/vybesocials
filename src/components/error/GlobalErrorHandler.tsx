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

    const shouldIgnoreForSelfHeal = (msg: string) => {
      const m = msg.toLowerCase();
      return (
        m.includes('resizeobserver')
        || m.includes('loading chunk')
        || m.includes('failed to fetch')
        || m.includes('networkerror')
        || m.includes('channel error')
        || m.includes('channel_error')
        || m.includes('globalrt')
        || m.includes('presence')
        || m.includes('realtime')
        || m.includes('abort')
        || m.includes('not authenticated')
        || m.includes('profile still loading')
      );
    };

    // Track all errors for pattern detection
    const handleAllErrors = (event: ErrorEvent) => {
      if (event.message && !shouldIgnoreForSelfHeal(event.message)) {
        trackError(event.message);
      }
    };

    // Track unhandled promise rejections
    const handleRejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.isAuthGuard) return;
      const msg = event.reason?.message || event.reason?.toString() || '';
      if (shouldIgnoreForSelfHeal(msg)) return;
      if (msg) trackError(msg);
    };

    // AI self-heal asked us to refetch all live queries
    const handleSelfHealRefetch = () => {
      try { queryClient.invalidateQueries(); } catch { /* ignore */ }
    };

    window.addEventListener('error', handleChunkError);
    window.addEventListener('error', handleAllErrors);
    window.addEventListener('unhandledrejection', handleRejection);
    window.addEventListener('vybe:self-heal:refetch', handleSelfHealRefetch);

    return () => {
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('error', handleAllErrors);
      window.removeEventListener('unhandledrejection', handleRejection);
      window.removeEventListener('vybe:self-heal:refetch', handleSelfHealRefetch);
    };
  }, [queryClient]);

  return null;
}

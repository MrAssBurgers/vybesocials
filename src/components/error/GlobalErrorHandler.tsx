import { lazy, Suspense, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { trackError, clearAppCache, isChunkLoadError } from '@/lib/selfHealingMonitor';
import { showBootRecovery } from '@/lib/bootGuard';

const BackgroundErrorReporter = lazy(() => import('./BackgroundErrorReporter'));

export function GlobalErrorHandler() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // No online/offline toasts — silent background reconnect.
    // Reconnect logic still runs via reconnectManager; we just don't surface UI.

    // Handle chunk loading errors — show recovery if shell is blank
    let chunkNoticeShown = false;
    const recoverChunk = (message: string) => {
      if (!isChunkLoadError(message) || chunkNoticeShown) return;
      chunkNoticeShown = true;

      const hasContent =
        typeof window.__VYBE_HAS_MEANINGFUL_CONTENT__ === 'function' &&
        window.__VYBE_HAS_MEANINGFUL_CONTENT__();

      if (!hasContent) {
        showBootRecovery('chunk_error');
      } else {
        toast.error('This screen couldn’t load', {
          description: 'Refresh to get the latest app files. Your account stays signed in.',
          duration: Infinity,
          action: {
            label: 'Refresh',
            onClick: async () => {
              await clearAppCache();
              window.location.reload();
            },
          },
        });
      }
    };
    const handleChunkError = (event: ErrorEvent) => recoverChunk(event.message || '');

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
      if (isChunkLoadError(msg)) {
        recoverChunk(msg);
        return;
      }
      if (shouldIgnoreForSelfHeal(msg)) return;
      if (msg) trackError(msg);
    };

    // AI self-heal asked us to refetch all live queries
    const handleSelfHealRefetch = () => {
      try {
        void queryClient.refetchQueries({ type: 'active', stale: true });
      } catch { /* ignore */ }
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

  return <Suspense fallback={null}><BackgroundErrorReporter /></Suspense>;
}

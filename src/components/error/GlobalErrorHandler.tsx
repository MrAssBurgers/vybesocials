import { useEffect } from 'react';
import { useErrorReporter } from '@/hooks/useErrorReporter';
import { toast } from 'sonner';

export function GlobalErrorHandler() {
  useErrorReporter();

  useEffect(() => {
    const handleOnline = () => {
      toast.success('Back online! 🌐', {
        description: 'Your connection has been restored.',
      });
    };

    const handleOffline = () => {
      toast.error('You\'re offline 📡', {
        description: 'Check your internet connection.',
      });
    };

    const handleChunkError = (event: ErrorEvent) => {
      if (event.message?.includes('Loading chunk') || event.message?.includes('Failed to fetch')) {
        toast.error('Update available! 🔄', {
          description: 'Refreshing to get the latest version...',
          duration: 2000,
        });
        setTimeout(() => window.location.reload(), 2000);
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('[VYBE] Unhandled rejection in app:', event.reason);
      event.preventDefault();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('error', handleChunkError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('error', handleChunkError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return null;
}

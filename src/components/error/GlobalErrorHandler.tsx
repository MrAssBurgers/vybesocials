import { useEffect } from 'react';
import { useErrorReporter } from '@/hooks/useErrorReporter';
import { toast } from 'sonner';

export function GlobalErrorHandler() {
  useErrorReporter();

  useEffect(() => {
    // Handle network errors gracefully
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

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Handle chunk loading errors (common with lazy loading)
    const handleChunkError = (event: ErrorEvent) => {
      if (event.message?.includes('Loading chunk') || event.message?.includes('Failed to fetch')) {
        toast.error('Update available! 🔄', {
          description: 'Refreshing to get the latest version...',
          duration: 2000,
        });
        
        // Auto-refresh after a short delay
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    };

    window.addEventListener('error', handleChunkError);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('error', handleChunkError);
    };
  }, []);

  return null;
}

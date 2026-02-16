import { useEffect, useCallback } from 'react';

interface ErrorReport {
  message: string;
  stack?: string;
  url: string;
  timestamp: string;
  type: 'error' | 'unhandledrejection' | 'console';
}

const errorQueue: ErrorReport[] = [];
let isProcessing = false;

async function processErrorQueue() {
  if (isProcessing || errorQueue.length === 0) return;
  isProcessing = true;

  while (errorQueue.length > 0) {
    const error = errorQueue.shift();
    if (!error) continue;

    try {
      // Log to console in dev mode
      if (import.meta.env.DEV) {
        console.log('[ErrorReporter]', error);
      }

      // In production, you could send to a logging service
      // For now, we just log locally
    } catch {
      // Ignore reporting errors
    }
  }

  isProcessing = false;
}

export function useErrorReporter() {
  const reportError = useCallback((error: Error | string, type: ErrorReport['type'] = 'error') => {
    const report: ErrorReport = {
      message: typeof error === 'string' ? error : error.message,
      stack: typeof error === 'string' ? undefined : error.stack,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      type,
    };

    errorQueue.push(report);
    processErrorQueue();
  }, []);

  useEffect(() => {
    // Global error handler
    const handleError = (event: ErrorEvent) => {
      reportError(event.error || event.message, 'error');
    };

    // Unhandled promise rejection handler
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // Suppress auth guard errors — they're user-facing toasts, not bugs
      if (event.reason?.isAuthGuard) return;
      const message = event.reason?.message || event.reason?.toString() || 'Unhandled promise rejection';
      // Suppress generic "Not authenticated" from mutations — already shown as toast
      if (message === 'Not authenticated') return;
      reportError(message, 'unhandledrejection');
    };

    // Console error interceptor (optional, for catching library errors)
    const originalConsoleError = console.error;
    console.error = (...args) => {
      originalConsoleError.apply(console, args);
      
      // Only report actual errors, not warnings or logs
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      
      if (message.toLowerCase().includes('error') && !message.includes('[ErrorReporter]')) {
        reportError(message, 'console');
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      console.error = originalConsoleError;
    };
  }, [reportError]);

  return { reportError };
}

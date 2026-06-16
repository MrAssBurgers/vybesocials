import { useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';

interface ErrorReport {
  message: string;
  stack?: string;
  url: string;
  timestamp: string;
  type: 'error' | 'unhandledrejection' | 'console';
}

const errorQueue: ErrorReport[] = [];
let isProcessing = false;
let sessionId: string | null = null;

function getSessionId() {
  if (!sessionId) {
    sessionId = crypto.randomUUID?.() || Math.random().toString(36).slice(2);
  }
  return sessionId;
}

// Dedupe: don't log the same error more than once per 30s
const recentlyLogged = new Map<string, number>();
const DEDUPE_WINDOW = 30_000;

function isDuplicate(message: string): boolean {
  const key = message.slice(0, 120);
  const last = recentlyLogged.get(key);
  const now = Date.now();
  if (last && now - last < DEDUPE_WINDOW) return true;
  recentlyLogged.set(key, now);
  // Prune old entries
  if (recentlyLogged.size > 50) {
    for (const [k, v] of recentlyLogged) {
      if (now - v > DEDUPE_WINDOW) recentlyLogged.delete(k);
    }
  }
  return false;
}

async function processErrorQueue() {
  if (isProcessing || errorQueue.length === 0) return;
  isProcessing = true;

  // Batch up to 5 errors at once
  const batch = errorQueue.splice(0, 5);

  try {
    const { data: { user } } = await db.auth.getUser();

    const rows = batch.map(err => ({
      user_id: user?.id || null,
      error_message: err.message.slice(0, 2000),
      error_stack: err.stack?.slice(0, 4000) || null,
      error_type: err.type,
      page_url: err.url,
      user_agent: navigator.userAgent.slice(0, 500),
      session_id: getSessionId(),
    }));

    await db.from('error_logs').insert(rows);
  } catch {
    // Silent fail — never let error reporting cause errors
  }

  isProcessing = false;

  // Process remaining
  if (errorQueue.length > 0) {
    setTimeout(processErrorQueue, 1000);
  }
}

export function useErrorReporter() {
  const reportError = useCallback((error: Error | string, type: ErrorReport['type'] = 'error') => {
    const message = typeof error === 'string' ? error : error.message;
    
    // Skip noise
    if (!message || isDuplicate(message)) return;

    const report: ErrorReport = {
      message,
      stack: typeof error === 'string' ? undefined : error.stack,
      url: window.location.href,
      timestamp: new Date().toISOString(),
      type,
    };

    errorQueue.push(report);
    // Debounce DB writes
    setTimeout(processErrorQueue, 2000);
  }, []);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      reportError(event.error || event.message, 'error');
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.isAuthGuard) return;
      const message = event.reason?.message || event.reason?.toString() || 'Unhandled promise rejection';
      if (message === 'Not authenticated') return;
      reportError(message, 'unhandledrejection');
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [reportError]);

  return { reportError };
}

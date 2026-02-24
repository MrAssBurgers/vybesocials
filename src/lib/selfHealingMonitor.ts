/**
 * Self-Healing Monitor
 * Tracks error patterns per session and triggers proactive notifications
 * when repeated issues are detected. Also provides auto-recovery utilities.
 */
import { toast } from 'sonner';

interface ErrorRecord {
  key: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

const ERROR_WINDOW_MS = 60_000; // 1 minute window
const PATTERN_THRESHOLD = 3; // 3 occurrences triggers notification
const COOLDOWN_MS = 120_000; // Don't re-notify for same error within 2 min

const errorMap = new Map<string, ErrorRecord>();
const notifiedKeys = new Map<string, number>();

/** Normalize an error message to a stable key for deduplication */
function normalizeKey(message: string): string {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    .replace(/\d{10,}/g, '<TIMESTAMP>')
    .replace(/https?:\/\/[^\s]+/g, '<URL>')
    .substring(0, 120);
}

/** Record an error occurrence and check for patterns */
export function trackError(message: string): void {
  const key = normalizeKey(message);
  const now = Date.now();

  const existing = errorMap.get(key);
  if (existing) {
    // Reset if outside window
    if (now - existing.firstSeen > ERROR_WINDOW_MS) {
      existing.count = 1;
      existing.firstSeen = now;
    } else {
      existing.count++;
    }
    existing.lastSeen = now;
  } else {
    errorMap.set(key, { key, count: 1, firstSeen: now, lastSeen: now });
  }

  const record = errorMap.get(key)!;
  if (record.count >= PATTERN_THRESHOLD) {
    const lastNotified = notifiedKeys.get(key) || 0;
    if (now - lastNotified > COOLDOWN_MS) {
      notifiedKeys.set(key, now);
      notifyPatternDetected(record);
    }
  }

  // Prune old entries
  if (errorMap.size > 50) {
    const cutoff = now - ERROR_WINDOW_MS * 2;
    for (const [k, v] of errorMap) {
      if (v.lastSeen < cutoff) errorMap.delete(k);
    }
  }
}

function notifyPatternDetected(record: ErrorRecord) {
  toast.info("We noticed something isn't working right", {
    description: 'Our system detected a repeated issue and is attempting to fix it automatically.',
    duration: 6000,
    action: {
      label: 'Refresh',
      onClick: () => {
        clearAppCache();
        window.location.reload();
      },
    },
  });

  // Attempt auto-recovery
  attemptAutoRecovery(record);
}

/** Auto-recovery strategies based on error type */
function attemptAutoRecovery(record: ErrorRecord) {
  const key = record.key.toLowerCase();

  // Network / fetch errors → clear stale queries
  if (key.includes('fetch') || key.includes('network') || key.includes('failed to fetch')) {
    clearAppCache();
    return;
  }

  // Auth errors → force session refresh
  if (key.includes('auth') || key.includes('jwt') || key.includes('token')) {
    refreshAuth();
    return;
  }

  // Storage / quota errors → clear caches
  if (key.includes('quota') || key.includes('storage') || key.includes('localstorage')) {
    pruneLocalStorage();
    return;
  }
}

/** Clear browser caches (Service Worker, Cache API) */
export function clearAppCache() {
  if ('caches' in window) {
    caches.keys().then(names => names.forEach(name => caches.delete(name)));
  }
}

/** Force a Supabase session refresh */
async function refreshAuth() {
  try {
    const { supabase } = await import('@/integrations/supabase/client');
    await supabase.auth.refreshSession();
  } catch {
    // Silent fail — worst case user re-logs
  }
}

/** Remove non-essential items from localStorage when nearing quota */
function pruneLocalStorage() {
  try {
    const preserveKeys = ['sb-', 'supabase.auth'];
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && !preserveKeys.some(p => key.startsWith(p))) {
        toRemove.push(key);
      }
    }
    toRemove.forEach(k => localStorage.removeItem(k));
  } catch {
    // localStorage may be entirely unavailable
  }
}

/** Resilient fetch wrapper with automatic retry */
export async function resilientFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  maxRetries = 2,
  baseDelay = 1000,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(input, init);
      // Don't retry client errors (4xx), only server errors (5xx) and network failures
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt)));
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}

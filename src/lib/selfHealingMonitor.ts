/**
 * Self-Healing Monitor
 * Tracks error patterns per session and triggers proactive notifications
 * when repeated issues are detected. Also provides auto-recovery utilities.
 */
import { toast } from 'sonner';
import { refreshFirebaseSession } from '@/lib/firebaseAuthRefresh';

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

/** Clear session error tracking (after Fix All / manual dismiss). */
export function clearErrorTracking(): void {
  errorMap.clear();
  notifiedKeys.clear();
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
  // Silent recovery — no loading toast (users reported it as spam on Messages).
  const toastId = null;

  const heuristic = pickHeuristic(record.key);
  if (heuristic) {
    executeFix(heuristic, record, toastId, undefined, true);
    return;
  }
  // Skip client-side ai-auto-fix calls; heuristics only.
}

type FixAction = 'clear_cache' | 'refresh_auth' | 'refetch_queries' | 'prune_storage' | 'reload' | 'none';

function pickHeuristic(rawKey: string): FixAction | null {
  const key = rawKey.toLowerCase();
  if (key.includes('fetch') || key.includes('network') || key.includes('failed to fetch') || key.includes('loading chunk')) return 'clear_cache';
  if (key.includes('jwt') || key.includes('token') || (key.includes('auth') && !key.includes('author'))) return 'refresh_auth';
  if (key.includes('quota') || key.includes('localstorage') || key.includes('quotaexceeded')) return 'prune_storage';
  return null;
}

async function requestAiFix(record: ErrorRecord, toastId: string | number) {
  try {
    const { db } = await import('@/lib/firebase');
    // Avoid sending an anon-only bearer (which fails with "missing sub claim").
    const { data: { session } } = await db.auth.getSession();
    if (!session?.access_token) {
      toast.dismiss(toastId);
      return;
    }
    const { data, error } = await db.functions.invoke('ai-auto-fix', {
      body: {
        message: record.key,
        route: typeof window !== 'undefined' ? window.location.pathname : '',
        occurrences: record.count,
      },
    });
    if (error || !data?.fix) {
      toast.dismiss(toastId);
      toast.message("Couldn't auto-fix this", { description: 'Try refreshing if it keeps happening.', duration: 4000 });
      return;
    }
    const fix = data.fix as { action: FixAction; user_message: string; rationale: string; confidence: number };
    executeFix(fix.action, record, toastId, fix);
  } catch {
    toast.dismiss(toastId);
  }
}

function executeFix(
  action: FixAction,
  _record: ErrorRecord,
  toastId: string | number | null,
  fix?: { user_message: string; rationale: string; confidence: number },
  silent = false,
) {
  const label = fix?.user_message || defaultLabelFor(action);
  const desc = fix?.rationale || defaultDescFor(action);

  switch (action) {
    case 'clear_cache':
      clearAppCache();
      break;
    case 'refresh_auth':
      void refreshAuth();
      break;
    case 'refetch_queries':
      try { window.dispatchEvent(new CustomEvent('vybe:self-heal:refetch')); } catch { /* ignore */ }
      break;
    case 'prune_storage':
      pruneLocalStorage();
      break;
    case 'reload':
      clearAppCache();
      setTimeout(() => window.location.reload(), 1200);
      break;
    case 'none':
    default:
      if (toastId != null) toast.dismiss(toastId);
      if (!silent) {
        toast.message('We noticed something off', { description: desc, duration: 5000 });
      }
      return;
  }

  if (toastId != null) toast.dismiss(toastId);
  if (!silent) {
    toast.success(label, {
      description: desc,
      duration: 5000,
      action: action !== 'reload' ? {
        label: 'Refresh',
        onClick: () => { clearAppCache(); window.location.reload(); },
      } : undefined,
    });
  }
}

function defaultLabelFor(action: FixAction): string {
  switch (action) {
    case 'clear_cache': return 'Cleared stale data';
    case 'refresh_auth': return 'Refreshed your session';
    case 'refetch_queries': return 'Reloaded the latest data';
    case 'prune_storage': return 'Freed up storage';
    case 'reload': return 'Reloading to recover…';
    default: return 'No fix needed';
  }
}
function defaultDescFor(action: FixAction): string {
  switch (action) {
    case 'clear_cache': return 'Network or cache hiccup — flushed it.';
    case 'refresh_auth': return 'Token looked expired — refreshed.';
    case 'refetch_queries': return 'Pulled the latest server data.';
    case 'prune_storage': return 'Removed non-essential cached items.';
    case 'reload': return 'Doing a quick reload to recover.';
    default: return 'Nothing safe to auto-fix here.';
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
    await refreshFirebaseSession();
  } catch {
    // Silent fail — worst case user re-logs
  }
}

/** Remove non-essential items from localStorage when nearing quota */
function pruneLocalStorage() {
  try {
    const preserveKeys = ['sb-', 'db.auth'];
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

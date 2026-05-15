/**
 * Silent Auto Bug Reporter
 * Detects errors in the background and silently reports them to the bug_reports table.
 * Requires user consent via localStorage key 'vybe_crash_consent'.
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { trackError } from '@/lib/selfHealingMonitor';
import { getConsentState } from '@/lib/crashReportConsent';

interface DetectedBug {
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  userAgent: string;
  timestamp: number;
}

// Deduplicate per session — first occurrence reports, repeats throttled
const reportedKeys = new Set<string>();

// Per-key cooldown: same error key (normalized) won't re-enqueue within window
const recentEnqueues = new Map<string, number>();
const PER_KEY_COOLDOWN_MS = 30_000; // 30s

// Global rate cap: never enqueue more than N reports in a rolling window
const recentEnqueueTimestamps: number[] = [];
const RATE_WINDOW_MS = 5_000;
const RATE_MAX_PER_WINDOW = 8;

function bugKey(msg: string): string {
  return msg
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
    .replace(/\d{10,}/g, '')
    .substring(0, 100);
}

const IGNORED_PATTERNS = [
  'ResizeObserver loop',
  'Loading chunk',
  'Failed to fetch dynamically',
  'Importing a module script',
  'Unable to preload CSS',
  'Not authenticated',
  'popstate',
  'Script error',
  'isAuthGuard',
  'Sign in was cancelled',
  'Popup was blocked',
  'AbortError',
  'cancelled',
  'user aborted',
  'favicon',
  'chrome-extension',
  'moz-extension',
  'webkit-masked',
  'lovable.app/assets',
  '"error":"Offline"',
  'Channel error',
  'Max retries reached',
  'GlobalRT',
  'CHANNEL_ERROR',
  'net::ERR_',
  'NetworkError',
  'Failed to send a request to the Edge Function',
  'presence',
  'Presence',
  'Failed to fetch',
  'track_presence',
  'untrack_presence',
  'presenceRef',
  'heartbeat',
  'device motion',
  'DeviceMotionEvent',
  'user gesture to prompt',
  'Requesting device',
  'OneSignal service worker not found',
  '[WM] No SW registration',
  'No SW registration for postMessage',
  'Edge function returned a non-2xx',
  'Edge Function returned a non-2xx',
  'invalid_credentials',
  'auth-2fa-preauth',
  'Edge function returned 401',
];

const BUG_STATUS_CODES = [400, 403, 404, 409, 422, 500, 502, 504];

const IGNORED_URL_PATTERNS = [
  '/auth/',
  '/token',
  'analytics',
  'beacon',
  'sentry',
  'hotjar',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg',
  '.woff', '.webm', '.mp4', '.mp3', '.ogg',
  '/storage/v1/',
];

function shouldIgnore(msg: string): boolean {
  const lower = msg.toLowerCase();
  return IGNORED_PATTERNS.some(p => lower.includes(p.toLowerCase()));
}

function shouldIgnoreUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return IGNORED_URL_PATTERNS.some(p => lower.includes(p));
}

// Queue for batching reports
let reportQueue: DetectedBug[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flushReports() {
  if (reportQueue.length === 0) return;
  const batch = reportQueue.splice(0, 10); // max 10 per flush

  try {
    const { data: { user } } = await supabase.auth.getUser();
    const reporterId = user?.id;
    if (!reporterId) return; // can't report without auth

    // Resolve profile id
    let profileId = reporterId;
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .or(`id.eq.${reporterId},user_id.eq.${reporterId}`)
      .limit(1)
      .maybeSingle();
    if (profile?.id) profileId = profile.id;

    const rows = batch.map(bug => ({
      reporter_id: profileId,
      error_message: bug.message.substring(0, 500),
      error_stack: bug.stack?.substring(0, 2000) || null,
      component_stack: bug.componentStack?.substring(0, 1000) || null,
      page_url: bug.url,
      user_agent: bug.userAgent?.substring(0, 300) || null,
      ai_analysis: null,
      ai_severity: 'auto',
    }));

    const { data: inserted } = await supabase
      .from('bug_reports')
      .insert(rows)
      .select('id');

    // Fire-and-forget AI triage so admins see root-cause + suggested fix in the panel.
    if (inserted && inserted.length) {
      for (const row of inserted) {
        try {
          void supabase.functions.invoke('analyze-bug-report', { body: { bugId: row.id } });
        } catch {
          // Silent — analysis is best-effort.
        }
      }
    }
  } catch {
    // Silent fail — never interrupt the user
  }
}

function enqueueReport(bug: DetectedBug) {
  const key = bugKey(bug.message);

  // Per-key cooldown — silently drop bursts of identical errors
  // (e.g. dozens of broken-tunnel avatar images firing during scroll)
  const now = Date.now();
  const last = recentEnqueues.get(key);
  if (last && now - last < PER_KEY_COOLDOWN_MS) return;
  recentEnqueues.set(key, now);

  // Global rate cap — drop if we've enqueued too many recently
  while (recentEnqueueTimestamps.length && now - recentEnqueueTimestamps[0] > RATE_WINDOW_MS) {
    recentEnqueueTimestamps.shift();
  }
  if (recentEnqueueTimestamps.length >= RATE_MAX_PER_WINDOW) return;
  recentEnqueueTimestamps.push(now);

  // Session-level dedupe (one report per unique key per session)
  if (reportedKeys.has(key)) return;
  reportedKeys.add(key);

  trackError(bug.message);

  if (getConsentState() !== true) return;

  reportQueue.push(bug);
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushReports, 2000);
}

function classifyHttpError(status: number, url: string, body?: string): DetectedBug | null {
  if (!BUG_STATUS_CODES.includes(status)) return null;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const isAppRequest = url.includes(supabaseUrl) || url.startsWith(window.location.origin);
  if (!isAppRequest) return null;
  if (shouldIgnoreUrl(url)) return null;

  const shortUrl = url.replace(supabaseUrl, '').split('?')[0];
  const errorSnippet = body?.substring(0, 200) || '';
  const message = `HTTP ${status} from ${shortUrl}${errorSnippet ? ': ' + errorSnippet : ''}`;
  if (shouldIgnore(message)) return null;

  return {
    message,
    stack: `Endpoint: ${shortUrl}\nStatus: ${status}\nResponse: ${errorSnippet}`,
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: Date.now(),
  };
}

export function useAutoBugReporter() {
  const installedRef = useRef(false);

  useEffect(() => {
    if (installedRef.current) return;
    installedRef.current = true;

    const onError = (e: ErrorEvent) => {
      const msg = e.message || '';
      if (shouldIgnore(msg)) return;
      enqueueReport({
        message: msg,
        stack: e.error?.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
      });
    };

    const onRejection = (e: PromiseRejectionEvent) => {
      if (e.reason?.isAuthGuard) return;
      const msg = e.reason?.message || String(e.reason);
      if (msg === 'Not authenticated' || shouldIgnore(msg)) return;
      enqueueReport({
        message: msg,
        stack: e.reason?.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
      });
    };

    const onResourceError = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target || target === window as any) return;
      const tagName = target.tagName?.toLowerCase();
      if (!['img', 'script', 'link', 'video', 'audio'].includes(tagName)) return;
      const src = (target as HTMLImageElement).src || (target as HTMLLinkElement).href || '';
      if (!src || shouldIgnore(src) || shouldIgnoreUrl(src)) return;
      const isAppResource = src.startsWith(window.location.origin) || src.includes('supabase');
      if (!isAppResource) return;
      // Broken avatars/storage files are noisy and never actionable — skip
      if (src.includes('/storage/v1/') || /\/avatars?\//i.test(src)) return;
      // Skip during active scroll (prevents enqueue spikes)
      if (document.documentElement.classList.contains('is-scrolling')) return;
      const message = `Broken ${tagName}: ${src.split('/').pop()?.split('?')[0] || src}`;
      enqueueReport({
        message,
        stack: `Resource failed to load:\nTag: <${tagName}>\nURL: ${src}\nPage: ${window.location.href}`,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
      });
    };

    const originalConsoleError = console.error;
    console.error = function (...args: any[]) {
      originalConsoleError.apply(console, args);
      try {
        const msg = args.map(a => {
          if (a instanceof Error) return a.message;
          if (typeof a === 'string') return a;
          try { return JSON.stringify(a)?.substring(0, 200); } catch { return String(a); }
        }).join(' ').substring(0, 300);
        if (!msg || shouldIgnore(msg)) return;
        if (msg.includes('Warning:') || msg.includes('Deprecation')) return;
        if (msg.includes('Bug report')) return;
        const stack = args.find(a => a instanceof Error)?.stack;
        enqueueReport({
          message: `Console error: ${msg}`,
          stack: stack || `Console.error called at ${window.location.href}`,
          url: window.location.href,
          userAgent: navigator.userAgent,
          timestamp: Date.now(),
        });
      } catch {
        // Never let the interceptor itself throw
      }
    };

    const originalFetch = window.fetch;
    window.fetch = async function (...args: Parameters<typeof fetch>) {
      try {
        const response = await originalFetch.apply(this, args);
        if (BUG_STATUS_CODES.includes(response.status)) {
          const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;
          const cloned = response.clone();
          try {
            const body = await cloned.text();
            const bug = classifyHttpError(response.status, url, body);
            if (bug) enqueueReport(bug);
          } catch {
            const bug = classifyHttpError(response.status, url);
            if (bug) enqueueReport(bug);
          }
        }
        return response;
      } catch (err) {
        throw err;
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onResourceError, true);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onResourceError, true);
      window.fetch = originalFetch;
      console.error = originalConsoleError;
      installedRef.current = false;
    };
  }, []);
}

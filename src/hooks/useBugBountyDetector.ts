/**
 * Bug Bounty Detector — Gamified bug detection system
 * Monitors for errors and presents users with a fun "You found a bug!" dialog
 * that rewards them with XP for reporting issues to the admin.
 */
import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { trackError } from '@/lib/selfHealingMonitor';

interface DetectedBug {
  message: string;
  stack?: string;
  componentStack?: string;
  url: string;
  userAgent: string;
  timestamp: number;
}

// Deduplicate bugs — don't spam the same bug repeatedly
const reportedKeys = new Set<string>();

function bugKey(msg: string): string {
  return msg
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '')
    .replace(/\d{10,}/g, '')
    .substring(0, 100);
}

// Errors to ignore (not real bugs, just noise)
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
  'lovable.app/assets', // Build asset 404s during HMR
  // Transient infrastructure / not real bugs
  '"error":"Offline"',       // Supabase 503 offline blips
  'Channel error',           // Realtime channel reconnects
  'Max retries reached',     // Realtime giving up (reconnects on next nav)
  'GlobalRT',                // All realtime log noise
  'CHANNEL_ERROR',
  'net::ERR_',               // Chrome network errors (transient)
  'NetworkError',
  'Failed to send a request to the Edge Function', // Edge cold-start transient
];

// HTTP status codes that indicate real bugs
const BUG_STATUS_CODES = [400, 403, 404, 409, 422, 500, 502, 504]; // 503 excluded — transient "Offline" blips

// URLs to ignore for HTTP errors (auth endpoints, analytics, etc.)
const IGNORED_URL_PATTERNS = [
  '/auth/',
  '/token',
  'analytics',
  'beacon',
  'sentry',
  'hotjar',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.woff',
  '.webm',
  '.mp4',
  '.mp3',
  '.ogg',
  '/storage/v1/', // All storage asset 404s — missing uploads, not code bugs
];

function shouldIgnore(msg: string): boolean {
  const lower = msg.toLowerCase();
  return IGNORED_PATTERNS.some(p => lower.includes(p.toLowerCase()));
}

function shouldIgnoreUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return IGNORED_URL_PATTERNS.some(p => lower.includes(p));
}

/**
 * Classify an HTTP error from fetch/API calls as a reportable bug
 */
function classifyHttpError(status: number, url: string, body?: string): DetectedBug | null {
  if (!BUG_STATUS_CODES.includes(status)) return null;
  
  // Ignore non-app URLs
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

// Cache of globally claimed bug keys (checked against DB)
const globallyClaimedKeys = new Set<string>();

export function useBugBountyDetector() {
  const [pendingBug, setPendingBug] = useState<DetectedBug | null>(null);
  const [isReporting, setIsReporting] = useState(false);
  const installedRef = useRef(false);

  const onBugDetected = useCallback(async (bug: DetectedBug) => {
    const key = bugKey(bug.message);
    if (reportedKeys.has(key) || globallyClaimedKeys.has(key)) return;
    reportedKeys.add(key);

    // Also feed into the self-healing monitor
    trackError(bug.message);

    // Check if this bug was already reported by anyone globally
    try {
      const searchKey = key.substring(0, 60).replace(/[%_]/g, '');
      const { count } = await supabase
        .from('bug_reports')
        .select('id', { count: 'exact', head: true })
        .ilike('error_message', `%${searchKey}%`)
        .limit(1);

      if (count && count > 0) {
        globallyClaimedKeys.add(key);
        return; // Already claimed by someone else
      }
    } catch {
      // If check fails, still show the popup (fail open)
    }

    // Set pending bug for UI
    setPendingBug(bug);
  }, []);

  useEffect(() => {
    if (installedRef.current) return;
    installedRef.current = true;

    // 1) Runtime JS errors
    const onError = (e: ErrorEvent) => {
      const msg = e.message || '';
      if (shouldIgnore(msg)) return;

      onBugDetected({
        message: msg,
        stack: e.error?.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
      });
    };

    // 2) Unhandled promise rejections
    const onRejection = (e: PromiseRejectionEvent) => {
      if (e.reason?.isAuthGuard) return;
      const msg = e.reason?.message || String(e.reason);
      if (msg === 'Not authenticated' || shouldIgnore(msg)) return;

      onBugDetected({
        message: msg,
        stack: e.reason?.stack,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
      });
    };

    // 3) Broken images / resources (img, script, link load failures)
    const onResourceError = (e: Event) => {
      const target = e.target as HTMLElement;
      if (!target || target === window as any) return;
      
      const tagName = target.tagName?.toLowerCase();
      if (!['img', 'script', 'link', 'video', 'audio'].includes(tagName)) return;
      
      const src = (target as HTMLImageElement).src || (target as HTMLLinkElement).href || '';
      if (!src || shouldIgnore(src) || shouldIgnoreUrl(src)) return;
      
      // Only flag app resources, not external CDN images that users uploaded
      const isAppResource = src.startsWith(window.location.origin) || src.includes('supabase');
      if (!isAppResource) return;

      const message = `Broken ${tagName}: ${src.split('/').pop()?.split('?')[0] || src}`;
      onBugDetected({
        message,
        stack: `Resource failed to load:\nTag: <${tagName}>\nURL: ${src}\nPage: ${window.location.href}`,
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
      });
    };

    // 4) Console.error interception — catches React errors, library errors, etc.
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
        // Skip React internal dev warnings (not bugs)
        if (msg.includes('Warning:') || msg.includes('Deprecation')) return;
        // Skip our own bug reporting logs
        if (msg.includes('Bug report')) return;
        
        const stack = args.find(a => a instanceof Error)?.stack;
        
        onBugDetected({
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

    // 5) Intercept fetch to catch HTTP errors as bugs
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
            if (bug) onBugDetected(bug);
          } catch {
            const bug = classifyHttpError(response.status, url);
            if (bug) onBugDetected(bug);
          }
        }
        
        return response;
      } catch (err) {
        throw err;
      }
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onResourceError, true); // capture phase for resource errors

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onResourceError, true);
      window.fetch = originalFetch;
      console.error = originalConsoleError;
      installedRef.current = false;
    };
  }, [onBugDetected]);

  const reportBug = useCallback(async () => {
    if (!pendingBug || isReporting) return;
    setIsReporting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Sign in to report bugs and earn XP!');
        setIsReporting(false);
        return;
      }

      // Resolve reporter_id from profiles to support schemas where profiles.id != auth.uid()
      let reporterId = user.id;
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .or(`id.eq.${user.id},user_id.eq.${user.id}`)
        .limit(1)
        .maybeSingle();

      if (profile?.id) {
        reporterId = profile.id;
      }

      // Get AI analysis
      let aiAnalysis = '';
      let aiSeverity = 'medium';
      try {
        const { data } = await supabase.functions.invoke('analyze-error', {
          body: {
            error: pendingBug.message,
            componentStack: pendingBug.componentStack,
            url: pendingBug.url,
            userAgent: pendingBug.userAgent,
          },
        });
        aiAnalysis = data?.explanation || '';
      } catch {
        aiAnalysis = 'Automated analysis unavailable';
      }

      // Insert bug report
      const { error: insertError } = await supabase.from('bug_reports').insert({
        reporter_id: reporterId,
        error_message: pendingBug.message,
        error_stack: pendingBug.stack?.substring(0, 2000),
        component_stack: pendingBug.componentStack?.substring(0, 1000),
        page_url: pendingBug.url,
        user_agent: pendingBug.userAgent?.substring(0, 300),
        ai_analysis: aiAnalysis,
        ai_severity: aiSeverity,
      });

      if (insertError) throw insertError;

      // Award 500 XP
      try {
        await supabase.rpc('add_user_xp', { p_user_id: user.id, p_xp_amount: 500 });
      } catch {
        // XP award failed silently — don't block the report
      }

      toast.success('Bug reported! +500 XP 🎉', {
        description: 'Thanks for helping make VYBE better!',
      });

      setPendingBug(null);
    } catch (err) {
      console.error('Bug report failed:', err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast.error('Failed to submit report. Try again!', {
        description: message.substring(0, 120),
      });
    } finally {
      setIsReporting(false);
    }
  }, [pendingBug, isReporting]);

  const dismissBug = useCallback(() => {
    setPendingBug(null);
  }, []);

  return { pendingBug, isReporting, reportBug, dismissBug };
}

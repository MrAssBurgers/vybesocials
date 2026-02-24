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

// Errors to ignore (not real bugs)
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
  'network',
  'offline',
  'AbortError',
  'cancelled',
  'user aborted',
];

function shouldIgnore(msg: string): boolean {
  const lower = msg.toLowerCase();
  return IGNORED_PATTERNS.some(p => lower.includes(p.toLowerCase()));
}

export function useBugBountyDetector() {
  const [pendingBug, setPendingBug] = useState<DetectedBug | null>(null);
  const [isReporting, setIsReporting] = useState(false);
  const installedRef = useRef(false);

  const onBugDetected = useCallback((bug: DetectedBug) => {
    const key = bugKey(bug.message);
    if (reportedKeys.has(key)) return;
    reportedKeys.add(key);

    // Also feed into the self-healing monitor
    trackError(bug.message);

    // Set pending bug for UI
    setPendingBug(bug);
  }, []);

  useEffect(() => {
    if (installedRef.current) return;
    installedRef.current = true;

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

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
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
        reporter_id: user.id,
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
      toast.error('Failed to submit report. Try again!');
    } finally {
      setIsReporting(false);
    }
  }, [pendingBug, isReporting]);

  const dismissBug = useCallback(() => {
    setPendingBug(null);
  }, []);

  return { pendingBug, isReporting, reportBug, dismissBug };
}

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { reportAccountGuard, submitSafetyReport, type ReportSubmission } from '@/lib/reportModerationService';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';

/** Every report completion belongs to the account and component that opened it. */
export function useSafetyReport(targetKey = '') {
  const { user } = useAuth();
  const session = useReportAccountSession();
  const lifetime = useRef({ mounted: true });
  useEffect(() => { const active = lifetime.current; active.mounted = true; return () => { active.mounted = false; }; }, []);
  const guard = useMemo(() => reportAccountGuard(user?.id || ''), [user?.id, session.epoch]);
  const sessionKey = `${user?.id || 'signed-out'}:${session.epoch}:${targetKey}`;
  const currentKey = useRef(sessionKey);
  currentKey.current = sessionKey;
  const assertCurrent = useCallback(() => {
    const active = lifetime.current;
    guard();
    if (!active.mounted || currentKey.current !== sessionKey) throw Object.assign(new Error('This report form is no longer open.'), { code: 'account-changed' });
  }, [guard, sessionKey]);
  const isCurrent = useCallback(() => { try { assertCurrent(); return true; } catch { return false; } }, [assertCurrent]);
  const submit = useCallback(async (input: ReportSubmission) => {
    const result = await submitSafetyReport(input, assertCurrent);
    assertCurrent();
    return result;
  }, [assertCurrent]);
  return Object.assign(submit, { sessionKey, assertCurrent, isCurrent });
}

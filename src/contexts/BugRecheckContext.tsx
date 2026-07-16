/**
 * BugRecheckContext — runs the AI bug re-check in the background so it survives
 * route changes and the admin section unmounting. State is exposed to any
 * consumer (e.g. AdminErrorsSection) so a progress bar can render in real time.
 *
 * The re-check loop:
 *   1) Pulls every bug with status != 'fixed' (cap 500)
 *   2) Calls analyze-bug-report with { force: true, verify: true }
 *      - The edge function decides whether the bug is still ACTIVE or LIKELY
 *        RESOLVED and updates status / ai_severity accordingly.
 *   3) Updates `done`/`total` as it goes — UI reads from this context.
 */
import { createContext, useContext, useMemo, useRef, useState, useCallback, ReactNode } from 'react';
import { db } from '@/lib/firebase';
import { useQueryClient } from '@tanstack/react-query';
import { useUserRole } from '@/hooks/useModeration';
import { isAdminRole } from '@/lib/adminAccess';

type BugRecheckState = {
  running: boolean;
  done: number;
  total: number;
  verified: number;
  resolved: number;
  failed: number;
  startedAt: number | null;
  finishedAt: number | null;
  lastError: string | null;
};

type BugRecheckContextValue = BugRecheckState & {
  start: () => Promise<void>;
  abort: () => void;
};

const initialState: BugRecheckState = {
  running: false,
  done: 0,
  total: 0,
  verified: 0,
  resolved: 0,
  failed: 0,
  startedAt: null,
  finishedAt: null,
  lastError: null,
};

const BugRecheckContext = createContext<BugRecheckContextValue | null>(null);

export function BugRecheckProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BugRecheckState>(initialState);
  const abortRef = useRef(false);
  const queryClient = useQueryClient();
  const { data: userRole, isFetched: roleFetched } = useUserRole();
  const isAdmin = roleFetched && isAdminRole(userRole);

  const update = useCallback((patch: Partial<BugRecheckState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const start = useCallback(async () => {
    if (state.running) return;
    if (!isAdmin) {
      update({ running: false, finishedAt: Date.now(), lastError: 'Admin access required' });
      return;
    }
    abortRef.current = false;

    setState({
      ...initialState,
      running: true,
      startedAt: Date.now(),
    });

    try {
      // No `.neq('status', …)` — Firestore inequality filters skip docs missing
      // the status field (legacy auto-reported bugs). Filter client-side.
      const { data: rows, error } = await db
        .from('bug_reports')
        .select('id, status')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      const ids: string[] = (rows || [])
        .filter((r: any) => r.status !== 'fixed')
        .map((r: any) => r.id);

      update({ total: ids.length });

      if (ids.length === 0) {
        update({ running: false, finishedAt: Date.now() });
        return;
      }

      const concurrency = 4;
      let cursor = 0;
      let verified = 0;
      let resolved = 0;
      let failed = 0;
      let done = 0;

      const worker = async () => {
        while (cursor < ids.length && !abortRef.current) {
          const id = ids[cursor++];
          try {
            const { data, error: invokeErr } = await db.functions.invoke('analyze-bug-report', {
              body: { bugId: id, force: true, verify: true },
            });
            if (invokeErr) {
              failed++;
            } else {
              // verify response shape: { ok, status: 'ACTIVE' | 'RESOLVED', severity }
              const verdict = (data as any)?.status;
              if (verdict === 'RESOLVED') resolved++;
              else verified++;
            }
          } catch {
            failed++;
          }
          done++;
          update({ done, verified, resolved, failed });
        }
      };

      await Promise.all(Array.from({ length: concurrency }, worker));

      // Refresh the bug list so resolved items disappear immediately.
      queryClient.invalidateQueries({ queryKey: ['admin-bug-reports-inline'] });
      queryClient.invalidateQueries({ queryKey: ['pending-moderation-count'] });

      update({ running: false, finishedAt: Date.now() });
    } catch (e: any) {
      update({ running: false, finishedAt: Date.now(), lastError: e?.message || 'Re-check failed' });
    }
  }, [state.running, isAdmin, update, queryClient]);

  const abort = useCallback(() => {
    abortRef.current = true;
    update({ running: false, finishedAt: Date.now() });
  }, [update]);

  const value = useMemo<BugRecheckContextValue>(
    () => ({ ...state, start, abort }),
    [state, start, abort]
  );

  return <BugRecheckContext.Provider value={value}>{children}</BugRecheckContext.Provider>;
}

export function useBugRecheck() {
  const ctx = useContext(BugRecheckContext);
  if (!ctx) throw new Error('useBugRecheck must be used inside <BugRecheckProvider>');
  return ctx;
}

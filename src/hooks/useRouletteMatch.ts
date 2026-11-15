import { useEffect, useRef, useState } from 'react';
import { useAuthProfileId } from './useAuthProfileId';
import { useReportAccountSession } from './useReportAccountSession';
import { reportAccountGuard, type ReportAccountGuard } from '@/lib/reportModerationService';
import { rouletteRequest, type RouletteMatch, type RouletteMode, type RouletteReply, type RouletteRequest, type RouletteStatus } from '@/lib/rouletteService';
export type { RouletteMatch, RouletteMode, RouletteStatus } from '@/lib/rouletteService';

type Action = 'join' | 'poll' | 'cancel' | 'end' | 'handoff';
type View = { status: RouletteStatus; match: RouletteMatch | null; error: string | null; pendingAction: Action | null; activeMode: RouletteMode; activeInterests: string[]; notice: string | null };
type Operation = { base: Pick<RouletteRequest, 'expectedOwnerUid' | 'expectedProfileId' | 'requestId'>; guard: ReportAccountGuard; mode: RouletteMode; interests: string[];
  stopped: boolean; complete: boolean; handedOff: boolean; timer?: ReturnType<typeof setTimeout>; match: RouletteMatch | null;
  revision: number; acknowledged: boolean; reading?: Promise<RouletteReply | undefined>; closing?: Promise<boolean>; handingOff?: Promise<RouletteMatch | undefined>; failedClose?: 'cancel' | 'end' };
const emptyView = (): View => ({ status: 'idle', match: null, error: null, pendingAction: null, activeMode: 'text', activeInterests: [], notice: null });

export function useRouletteMatch() {
  const profileId = useAuthProfileId(), session = useReportAccountSession();
  const account = { uid: session.uid, epoch: session.epoch, profileId };
  const owner = useRef(account); owner.current = account;
  const [view, setView] = useState<View>(emptyView);
  const active = useRef<Operation | null>(null), mounted = useRef(true);
  const guard = reportAccountGuard(session.uid);
  const viewGuard = () => {
    guard();
    const current = owner.current;
    if (current.uid !== account.uid || current.epoch !== account.epoch || current.profileId !== account.profileId) throw new Error('Your account changed. Reopen Roulette.');
  };
  const current = (operation: Operation, allowStopped = false) => {
    if (!mounted.current || active.current !== operation || (!allowStopped && operation.stopped)) return false;
    try { operation.guard(); return true; } catch { return false; }
  };
  const stop = (operation: Operation) => { operation.stopped = true; if (operation.timer) clearTimeout(operation.timer); operation.timer = undefined; };
  useEffect(() => {
    mounted.current = true; setView(emptyView());
    return () => {
      mounted.current = false; const operation = active.current; active.current = null;
      if (!operation) return; stop(operation);
      if (!operation.complete && !operation.handedOff && !operation.closing) {
        // Only the captured, still-current account may leave its own lease.
        void rouletteRequest({ ...operation.base, action: 'cancel' }, operation.guard).catch(() => {});
      }
    };
  }, [session.uid, session.epoch, profileId]);

  const read = (operation: Operation, action: 'join' | 'poll'): Promise<RouletteReply | undefined> => {
    if (operation.reading) return operation.reading;
    if (!current(operation)) return Promise.resolve(undefined);
    if (operation.handingOff) return Promise.resolve(undefined);
    const actualAction = operation.acknowledged ? action : 'join', revision = operation.revision;
    const request: RouletteRequest = { ...operation.base, action: actualAction, ...(actualAction === 'join' ? { mode: operation.mode, interests: operation.interests } : {}) };
    const pending = (async () => {
      try {
        const reply = await rouletteRequest(request, operation.guard);
        if (!current(operation) || operation.revision !== revision) return undefined;
        operation.acknowledged = true;
        operation.mode = reply.mode; operation.match = reply.match;
        operation.complete = reply.state === 'idle' || reply.state === 'ended';
        setView({ status: reply.state, match: reply.match, error: null, pendingAction: null, activeMode: reply.mode, activeInterests: reply.interests,
          notice: reply.resumed ? 'Resumed your existing ' + reply.mode + ' search.' : null });
        return reply;
      } catch (error) {
        if (current(operation) && operation.revision === revision) setView(previous => ({ ...previous, pendingAction: null, error: error instanceof Error ? error.message : 'Your search could not connect. Retry or leave this search.' }));
        return undefined;
      } finally {
        operation.reading = undefined;
        if (current(operation) && !operation.complete && !operation.handingOff && !operation.timer) {
          operation.timer = setTimeout(() => { operation.timer = undefined; void read(operation, 'poll'); }, 4000);
        }
      }
    })();
    operation.reading = pending; return pending;
  };

  const findMatch = async (mode: RouletteMode = 'text', interests: string[] = []): Promise<boolean> => {
    try { viewGuard(); } catch { return false; }
    if (!profileId || !session.uid || !mounted.current) return false;
    if (active.current && !active.current.complete) return false;
    const operation: Operation = { base: { expectedOwnerUid: session.uid, expectedProfileId: profileId, requestId: crypto.randomUUID() }, guard: viewGuard,
      mode, interests: [...interests], stopped: false, complete: false, handedOff: false, match: null, revision: 0, acknowledged: false };
    active.current = operation; setView({ status: 'searching', match: null, error: null, pendingAction: 'join', activeMode: mode, activeInterests: [...interests], notice: null });
    return !!await read(operation, 'join');
  };

  const close = (operation: Operation, action: 'cancel' | 'end'): Promise<boolean> => {
    if (operation.closing) return operation.closing;
    if (!current(operation, true)) return Promise.resolve(false);
    stop(operation); setView(previous => ({ ...previous, pendingAction: action, error: null }));
    const pending = (async () => {
      try {
        await rouletteRequest({ ...operation.base, action, ...(action === 'end' && operation.match ? { matchId: operation.match.id } : {}) }, operation.guard);
        if (!current(operation, true)) return false;
        operation.complete = true; active.current = null;
        setView(previous => ({ ...previous, status: action === 'end' ? 'ended' : 'idle', match: null, error: null, pendingAction: null, notice: null }));
        return true;
      } catch (error) {
        operation.failedClose = action;
        if (current(operation, true)) setView(previous => ({ ...previous, pendingAction: null, error: error instanceof Error ? error.message : 'Could not leave this search. Please retry.' }));
        return false;
      } finally { operation.closing = undefined; }
    })();
    operation.closing = pending; return pending;
  };
  const cancelSearch = async () => { try { viewGuard(); } catch { return false; } const operation = active.current; return operation ? close(operation, 'cancel') : true; };
  const endMatch = async () => { try { viewGuard(); } catch { return false; } const operation = active.current; return operation ? close(operation, operation.match ? 'end' : 'cancel') : true; };
  const skipToNext = async (mode: RouletteMode = 'text', interests: string[] = []) => {
    try { viewGuard(); } catch { return false; }
    if (!await endMatch()) return false;
    try { viewGuard(); } catch { return false; }
    return findMatch(mode, interests);
  };
  const retry = async () => {
    try { viewGuard(); } catch { return; }
    const operation = active.current; if (!operation) return;
    if (operation.failedClose) { await close(operation, operation.failedClose); return; }
    if (operation.timer) clearTimeout(operation.timer); operation.timer = undefined;
    await read(operation, 'poll');
  };
  const handoff = (): Promise<RouletteMatch | undefined> => {
    try { viewGuard(); } catch { return Promise.resolve(undefined); }
    const operation = active.current;
    if (operation?.handingOff) return operation.handingOff;
    if (!operation?.match || !current(operation)) return Promise.resolve(undefined);
    operation.revision++;
    if (operation.timer) clearTimeout(operation.timer); operation.timer = undefined;
    setView(previous => ({ ...previous, pendingAction: 'handoff', error: null }));
    const pending = (async () => { try {
      const reply = await rouletteRequest({ ...operation.base, action: 'handoff', matchId: operation.match.id }, operation.guard);
      if (!current(operation)) return;
      if (reply.state !== 'matched' || !reply.match?.conversation_id) throw new Error('This match has ended. Find another vibe.');
      operation.handedOff = true; operation.match = reply.match;
      setView(previous => ({ ...previous, pendingAction: null, match: reply.match, error: null })); return reply.match;
    } catch (error) {
      if (current(operation)) setView(previous => ({ ...previous, pendingAction: null, error: error instanceof Error ? error.message : 'Could not open this chat. Please retry.' }));
    } finally {
      operation.handingOff = undefined;
      if (current(operation) && !operation.complete && !operation.timer && !operation.reading) operation.timer = setTimeout(() => { operation.timer = undefined; void read(operation, 'poll'); }, 4000);
    } })();
    operation.handingOff = pending; return pending;
  };
  return { ...view, ready: !!profileId && !!session.uid, findMatch, cancelSearch, endMatch, skipToNext, retry, handoff };
}

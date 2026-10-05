import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, read: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid } }) }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => `${state.uid}-profile` }));
vi.mock('./useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: state.uid, epoch: state.epoch }) }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountGuard: () => { const epoch = state.epoch; return () => { if (epoch !== state.epoch) throw new Error('Account changed'); }; } }));
vi.mock('@/lib/firebase', () => ({ db: { from: (table: string) => {
  const uid = state.uid; const chain: any = { select: () => chain, eq: () => chain, gte: () => chain, order: () => chain, limit: () => chain, maybeSingle: () => chain,
    then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => Promise.resolve(state.read(table, uid)).then(resolve, reject) }; return chain;
} } }));
import { useLearningSignals } from './useLearningSignals';
const response = (table: string, uid: string) => ({ data: table === 'comments' ? [{ text: `${uid} private comment`, created_at: '2026-10-04T12:00:00.000Z' }] : table === 'vybe_dna' ? {} : [], count: table === 'comments' ? 1 : 0, error: null });
beforeEach(() => { vi.clearAllMocks(); state.uid = 'alice'; state.epoch++; state.read.mockImplementation(response); });
afterEach(cleanup);
it('masks previous-account comment text immediately while the next history read is pending', async () => {
  const hook = renderHook(useLearningSignals); await waitFor(() => expect(hook.result.current.data?.recent[0].label).toContain('alice private'));
  state.read.mockReturnValue(new Promise(() => {})); act(() => { state.uid = 'bob'; state.epoch++; hook.rerender(); });
  expect(hook.result.current.data).toBeNull(); expect(hook.result.current.loading).toBe(true);
});
it('drops old history after an away-and-back account epoch change', async () => {
  const pending: Array<() => void> = [];
  state.read.mockImplementation((table, uid) => new Promise(resolve => pending.push(() => resolve(response(table, uid)))));
  const hook = renderHook(useLearningSignals); await waitFor(() => expect(pending).toHaveLength(8));
  const old = [...pending]; act(() => { state.epoch += 2; hook.rerender(); });
  await act(async () => { old.forEach(resolve => resolve()); }); expect(hook.result.current.data).toBeNull();
});
it('a failed own-comment read is an error rather than a fabricated zero history', async () => {
  state.read.mockImplementation((table, uid) => table === 'comments' ? { data: null, error: new Error('History unavailable') } : response(table, uid));
  const hook = renderHook(useLearningSignals); await waitFor(() => expect(hook.result.current.error?.message).toBe('History unavailable'));
  expect(hook.result.current.data).toBeNull(); expect(hook.result.current.loading).toBe(false);
});

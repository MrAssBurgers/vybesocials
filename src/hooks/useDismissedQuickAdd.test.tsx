import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, read: vi.fn(), write: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid }, profile: { id: `profile-${state.uid}` } }) }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => ({ uid: state.uid, epoch: state.epoch }) }));
vi.mock('./useProfileAccount', () => ({ useProfileAccount: () => {
  const { uid, epoch } = state;
  return { ready: true, profile: { id: `profile-${uid}` }, session: { epoch }, guard: () => { if (state.uid !== uid || state.epoch !== epoch) throw Error('Account changed'); } };
} }));
vi.mock('@/lib/firebase', () => ({ db: { from: () => {
  const query = { select: () => query, eq: (_field: string, uid: string) => { query.uid = uid; return query; }, uid: '', maybeSingle: () => state.read(query.uid), upsert: state.write };
  return query;
} } }));
import { useDismissedQuickAdd } from './useDismissedQuickAdd';
beforeEach(() => { localStorage.clear(); state.uid = 'alice'; state.epoch = 1; state.read.mockReset().mockResolvedValue({ data: null }); state.write.mockReset().mockResolvedValue({ error: null }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it('ignores a delayed previous-account preference read, including A to B to A', async () => {
  let resolve!: (value: unknown) => void;
  state.read.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const hook = renderHook(useDismissedQuickAdd); state.uid = 'bob'; state.epoch++; hook.rerender(); state.uid = 'alice'; state.epoch++; hook.rerender();
  await act(async () => resolve({ data: { dismissed_quick_add_ids: ['stale-target'] } }));
  expect(hook.result.current.isDismissed('stale-target')).toBe(false);
  expect(localStorage.getItem('vybe_dismissed_quick_add_alice')).toBeNull();
});
it('retires a previously captured dismiss action after the account changes', () => {
  const hook = renderHook(useDismissedQuickAdd), old = hook.result.current.dismissUser;
  state.uid = 'bob'; state.epoch++; hook.rerender(); act(() => old('target'));
  expect(hook.result.current.isDismissed('target')).toBe(false); expect(state.write).not.toHaveBeenCalled();
});
it('keeps local dismissals usable when storage is restricted', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('Blocked storage'); });
  const hook = renderHook(useDismissedQuickAdd); act(() => hook.result.current.dismissUser('target'));
  expect(hook.result.current.isDismissed('target')).toBe(true);
  await waitFor(() => expect(state.write).toHaveBeenCalledOnce());
});

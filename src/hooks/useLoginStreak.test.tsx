import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { streakReceipt } from '@/test/loginStreakFixture';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, listeners: new Set<() => void>(), invoke: vi.fn(), session: { uid: 'alice', epoch: 1 }, nativeUser: { uid: 'alice', metadata: { creationTime: new Date(1700000000000).toUTCString() } } }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid }, profile: { id: `profile-${state.uid}`, user_id: state.uid } }) }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => ({ currentUser: state.nativeUser }) }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session, reportAccountSubscribe: (fn: () => void) => { state.listeners.add(fn); return () => state.listeners.delete(fn); }, reportAccountGuard: (uid: string) => { const epoch = state.session.epoch; return () => { if (uid !== state.session.uid || epoch !== state.session.epoch) throw new Error('Account changed'); }; } }));
vi.mock('@/lib/haptics', () => ({ haptics: { success: vi.fn() } }));
import { useLoginStreakStatus } from './useLoginStreak';
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const receipt = () => ({ data: streakReceipt({ ownerUid: state.uid, profileId: `profile-${state.uid}`, streak: 7, longestStreak: 7 }), error: null });
function change(uid: string) { state.uid = uid; state.session = { uid, epoch: ++state.epoch }; state.nativeUser = { uid, metadata: { creationTime: new Date(1700000000000).toUTCString() } }; for (const listener of state.listeners) listener(); }
beforeEach(() => { vi.clearAllMocks(); change('alice'); state.listeners.clear(); client = new QueryClient({ defaultOptions: { queries: { placeholderData: previous => previous, refetchOnMount: false, gcTime: 14 * 86400000, retry: false } } }); state.invoke.mockResolvedValue(receipt()); });
afterEach(() => { cleanup(); client.clear(); });
it('masks prior account and A→B→A data with actual production QueryClient defaults', async () => {
  const view = renderHook(useLoginStreakStatus, { wrapper }); await waitFor(() => expect(view.result.current.data?.streak).toBe(7));
  state.invoke.mockReturnValue(new Promise(() => {})); act(() => change('bob')); view.rerender(); expect(view.result.current.data).toBeUndefined();
  act(() => change('alice')); view.rerender(); expect(view.result.current.data).toBeUndefined();
});
it('hides stale confirmed count after failure and recovers on explicit retry', async () => {
  const view = renderHook(useLoginStreakStatus, { wrapper }); await waitFor(() => expect(view.result.current.data?.streak).toBe(7));
  state.invoke.mockRejectedValueOnce(new Error('Offline')); await act(() => view.result.current.refetch()); await waitFor(() => expect(view.result.current.isError).toBe(true)); expect(view.result.current.data).toBeUndefined();
  await act(() => view.result.current.refetch()); await waitFor(() => expect(view.result.current.data?.streak).toBe(7));
});
it('never paints a same-account cached count before a fresh mounted read', async () => {
  client.setQueryData(['login-streak', 'alice', 'profile-alice', state.session.epoch], streakReceipt({ streak: 99, longestStreak: 99 }));
  state.invoke.mockReturnValue(new Promise(() => {})); const view = renderHook(useLoginStreakStatus, { wrapper });
  expect(view.result.current.data).toBeUndefined(); await waitFor(() => expect(state.invoke).toHaveBeenCalledTimes(1));
});

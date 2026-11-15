import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ uid: 'alice', profileId: 'profile-alice', epoch: 1, join: vi.fn(), cancel: vi.fn(), end: vi.fn(), handoff: vi.fn(), channel: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: h.uid }, profile: { id: h.profileId, user_id: h.uid } }) }));
vi.mock('./useAuthProfileId', () => ({ useAuthProfileId: () => h.profileId }));
vi.mock('./useReportAccountSession', () => ({ useReportAccountSession: () => ({ uid: h.uid, epoch: h.epoch }) }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountGuard: (uid: string) => {
  const epoch = h.epoch;
  return () => { if (uid !== h.uid || epoch !== h.epoch) throw Object.assign(new Error('Account changed'), { code: 'account-changed' }); };
} }));
vi.mock('@/lib/realtimeChannel', () => ({ subscribePostgresChannel: h.channel, removeRealtimeChannel: vi.fn() }));
vi.mock('@/lib/firebase', () => ({ db: {
  rpc: async () => h.join(),
  from: (table: string) => table === 'profiles' ? { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 'profile-bob', username: 'bob', avatar_url: null, display_name: null }, error: null }) }) }) }
    : { delete: () => ({ eq: h.cancel }), update: () => ({ eq: h.end }) },
} }));
vi.mock('@/lib/rouletteService', () => ({ rouletteRequest: async (request: any, guard: () => void) => {
  guard();
  const outcome = request.action === 'cancel' ? await h.cancel() : request.action === 'end' ? await h.end() : request.action === 'handoff' ? await h.handoff() : await h.join();
  guard(); if (outcome.error) throw new Error(outcome.error.message);
  return { ok: true, ownerUid: h.uid, profileId: h.profileId, requestId: request.requestId, searchId: request.requestId,
    state: request.action === 'cancel' ? 'idle' : request.action === 'end' ? 'ended' : outcome.data ? 'matched' : 'searching',
    mode: request.mode || 'text', interests: [], expiresAt: Date.now() + 30000, match: outcome.data || null };
} }));
import { useRouletteMatch } from './useRouletteMatch';
const match = () => ({ id: 'match-one', user_a: 'profile-alice', user_b: 'profile-bob', mode: 'text', shared_interests: [], status: 'active', conversation_id: null, started_at: '2026-11-14T12:00:00Z', call_starter_profile_id: null, partner: { id: 'profile-bob', username: 'bob', avatar_url: null, display_name: null } });
function deferred() { let resolve!: (value: any) => void; const promise = new Promise<any>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => { vi.useFakeTimers(); h.uid = 'alice'; h.profileId = 'profile-alice'; h.epoch = 1; h.join.mockReset().mockResolvedValue({ data: null, error: null }); h.cancel.mockReset().mockResolvedValue({ error: null }); h.end.mockReset().mockResolvedValue({ error: null }); h.handoff.mockReset().mockResolvedValue({ data: { ...match(), conversation_id: 'chat-one' }, error: null }); h.channel.mockReset(); });
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); });

it('does not restore a match whose join completed after Cancel', async () => {
  const pending = deferred(); h.join.mockReturnValueOnce(pending.promise); const hook = renderHook(() => useRouletteMatch());
  let joining!: Promise<unknown>; act(() => { joining = hook.result.current.findMatch('text', []); });
  await act(async () => { await hook.result.current.cancelSearch(); });
  await act(async () => { pending.resolve({ data: match(), error: null }); await joining; });
  expect(hook.result.current.status).toBe('idle'); expect(hook.result.current.match).toBeNull();
});

it.each(['another account', 'same-account reentry'])('retires pending matching after %s', async change => {
  const pending = deferred(); h.join.mockReturnValueOnce(pending.promise); const hook = renderHook(() => useRouletteMatch());
  let joining!: Promise<unknown>; act(() => { joining = hook.result.current.findMatch('text', []); });
  if (change === 'another account') { h.uid = 'charlie'; h.profileId = 'profile-charlie'; } h.epoch++; hook.rerender();
  await act(async () => { pending.resolve({ data: match(), error: null }); await joining; });
  expect(hook.result.current.status).toBe('idle'); expect(hook.result.current.match).toBeNull(); expect(hook.result.current.error).toBeNull();
});

it('rejects a retained Find handler before it can dispatch for the next account', async () => {
  const hook = renderHook(() => useRouletteMatch()), retained = hook.result.current.findMatch;
  h.uid = 'charlie'; h.profileId = 'profile-charlie'; h.epoch++; hook.rerender();
  await act(async () => { await retained('text', []); });
  expect(h.join).not.toHaveBeenCalled(); expect(hook.result.current.status).toBe('idle');
});

it('shows failed Cancel and retains a retryable search instead of claiming it left', async () => {
  const hook = renderHook(() => useRouletteMatch()); await act(async () => { await hook.result.current.findMatch('text', []); });
  h.cancel.mockResolvedValue({ error: { message: 'Disconnected while cancelling' } });
  await act(async () => { await hook.result.current.cancelSearch(); });
  expect(hook.result.current.status).toBe('searching'); expect(hook.result.current.error).toMatch(/cancel|leave|disconnect/i);
});

it('does not skip into another search when ending the old match fails', async () => {
  h.join.mockResolvedValueOnce({ data: match(), error: null }); const hook = renderHook(() => useRouletteMatch());
  await act(async () => { await hook.result.current.findMatch('text', []); });
  h.end.mockResolvedValue({ error: { message: 'Disconnected while ending the match' } });
  await act(async () => { await hook.result.current.skipToNext('text', []); await vi.advanceTimersByTimeAsync(1200); });
  expect(h.join).toHaveBeenCalledTimes(1); expect(hook.result.current.status).toBe('matched'); expect(hook.result.current.error).toMatch(/end|disconnect/i);
});

it('does not overlap fallback polls while the previous poll is unresolved', async () => {
  const pending = deferred(); h.join.mockResolvedValueOnce({ data: null, error: null }).mockReturnValue(pending.promise);
  const hook = renderHook(() => useRouletteMatch()); await act(async () => { await hook.result.current.findMatch('text', []); });
  await act(async () => { await vi.advanceTimersByTimeAsync(16000); });
  expect(h.join).toHaveBeenCalledTimes(2); hook.unmount(); pending.resolve({ data: null, error: null });
});

it('does not let an older poll overwrite an acknowledged chat handoff', async () => {
  h.join.mockResolvedValueOnce({ data: match(), error: null }); const pending = deferred(); h.join.mockReturnValueOnce(pending.promise);
  const hook = renderHook(() => useRouletteMatch()); await act(async () => { await hook.result.current.findMatch('text', []); await vi.advanceTimersByTimeAsync(4000); });
  await act(async () => { await hook.result.current.handoff(); });
  await act(async () => { pending.resolve({ data: match(), error: null }); });
  expect(hook.result.current.match?.conversation_id).toBe('chat-one');
});

it('coalesces repeated handoff clicks before React can render pending state', async () => {
  h.join.mockResolvedValueOnce({ data: match(), error: null }); const pending = deferred(); h.handoff.mockReturnValueOnce(pending.promise);
  const hook = renderHook(() => useRouletteMatch()); await act(async () => { await hook.result.current.findMatch('text', []); });
  let first!: Promise<unknown>, second!: Promise<unknown>; act(() => { first = hook.result.current.handoff(); second = hook.result.current.handoff(); });
  expect(h.handoff).toHaveBeenCalledOnce(); await act(async () => { pending.resolve({ data: { ...match(), conversation_id: 'chat-one' }, error: null }); await Promise.all([first, second]); });
  expect(hook.result.current.match?.conversation_id).toBe('chat-one');
});

it('retains the selected match and offers retry after handoff fails', async () => {
  h.join.mockResolvedValueOnce({ data: match(), error: null }); h.handoff.mockResolvedValueOnce({ error: { message: 'Chat disconnected' } });
  const hook = renderHook(() => useRouletteMatch()); await act(async () => { await hook.result.current.findMatch('text', []); await hook.result.current.handoff(); });
  expect(hook.result.current.status).toBe('matched'); expect(hook.result.current.error).toBe('Chat disconnected'); expect(hook.result.current.pendingAction).toBeNull();
});

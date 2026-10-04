import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ session: { uid: 'alice', epoch: 1 }, user: { id: 'alice' }, profile: { id: 'alice-profile', user_id: 'alice', username: 'alice' }, send: vi.fn(), broadcast: vi.fn(), prewarm: vi.fn(), enqueue: vi.fn(), upload: vi.fn(), publicUrl: vi.fn(), info: vi.fn(), error: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.user, profile: state.profile }) }));
vi.mock('@/hooks/useReportAccountSession', () => ({ useReportAccountSession: () => state.session }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => state.session,
  reportAccountGuard: (expected: string) => { const captured = state.session; return () => { if (!expected || state.session.uid !== expected || captured.epoch !== state.session.epoch) throw Object.assign(new Error('Account changed'), { code: 'account-changed' }); }; } }));
vi.mock('@/lib/profileCache', () => ({ getCachedCurrentProfile: () => null, getCachedProfile: () => null }));
vi.mock('@/hooks/useGlobalRealtimeMessages', () => ({ registerOptimisticMessage: vi.fn() }));
vi.mock('@/lib/dmMembershipRepair', () => ({ inferOtherParticipantId: () => 'peer-profile' }));
vi.mock('@/lib/dmSendCore', () => ({ insertDmMessage: state.send, expiresAtForViewMode: () => null, isTransientSendError: (error: any) => error?.message === 'Offline' }));
vi.mock('@/lib/dmOutbox', () => ({ enqueue: state.enqueue }));
vi.mock('@/lib/dmBroadcast', () => ({ prewarmDmBroadcastChannel: state.prewarm, sendDmBroadcastMessage: state.broadcast }));
vi.mock('@/lib/firebase', () => ({ db: { storage: { from: () => ({ upload: state.upload, getPublicUrl: state.publicUrl }) } } }));
vi.mock('sonner', () => ({ toast: { info: state.info, error: state.error } }));
import { useInstantSend } from './useInstantSend';
import { messagesQueryKey } from '@/lib/messagesQueryKey';
const deferred = <T,>() => { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve }; };
const flush = async () => { for (let n = 0; n < 12; n++) await Promise.resolve(); };
function context() { const client = new QueryClient(); return { client, wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }; }
beforeEach(() => {
  state.session = { uid: 'alice', epoch: 1 }; state.user = { id: 'alice' }; state.profile = { id: 'alice-profile', user_id: 'alice', username: 'alice' };
  state.send.mockReset().mockImplementation(async payload => ({ data: { ...payload, id: 'saved', views: [], reactions: [] }, error: null }));
  state.broadcast.mockReset().mockResolvedValue(undefined); state.prewarm.mockReset(); state.enqueue.mockReset().mockResolvedValue(undefined);
  state.upload.mockReset().mockResolvedValue({ data: {}, error: null }); state.publicUrl.mockReset().mockReturnValue({ data: { publicUrl: 'https://fixture.invalid/video.mp4' } }); state.info.mockReset(); state.error.mockReset();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fixture'), revokeObjectURL: vi.fn() }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('instant sends require the rendered account to own the native session', () => {
  it.each(['old-user-and-profile', 'old-profile-only', 'unbound-profile'])('rejects %s before optimistic, broadcast, upload or queue work', async scenario => {
    state.session = { uid: 'bob', epoch: 2 };
    if (scenario !== 'old-user-and-profile') state.user = { id: 'bob' };
    if (scenario === 'unbound-profile') state.profile = { id: 'bob-profile', user_id: '', username: 'bob' };
    const env = context(); const hook = renderHook(() => useInstantSend('room'), env);
    await expect(hook.result.current.sendText('Old private draft')).rejects.toMatchObject({ code: 'account-changed' });
    await expect(hook.result.current.sendMedia('gs://old/image', 'image')).rejects.toMatchObject({ code: 'account-changed' });
    await expect(hook.result.current.sendVideo(new File(['data'], 'clip.mp4'), 'preview', 1)).rejects.toMatchObject({ code: 'account-changed' });
    expect(state.send).not.toHaveBeenCalled(); expect(state.broadcast).not.toHaveBeenCalled(); expect(state.prewarm).not.toHaveBeenCalled();
    expect(state.upload).not.toHaveBeenCalled(); expect(state.enqueue).not.toHaveBeenCalled(); expect(env.client.getQueryCache().getAll()).toHaveLength(0);
    hook.unmount(); env.client.clear();
  });
  it('sends successfully through the canonical callable when user/profile/session align', async () => {
    const env = context(); const hook = renderHook(() => useInstantSend('room'), env);
    await act(async () => { await hook.result.current.sendText('Current draft'); await flush(); });
    expect(state.send).toHaveBeenCalledWith(expect.objectContaining({ sender_id: 'alice-profile', content: 'Current draft', conversation_id: 'room' }), expect.objectContaining({ accountGuard: expect.any(Function) }));
    expect(env.client.getQueryData<any[]>(messagesQueryKey('room', state.session))?.map(row => row.id)).toEqual(['saved']);
    expect(state.broadcast).toHaveBeenCalledTimes(2); expect(state.enqueue).not.toHaveBeenCalled(); hook.unmount(); env.client.clear();
  });
  it('enables the new account only after its own profile is rendered, while keeping old callbacks rejected', async () => {
    const env = context(); const hook = renderHook(() => useInstantSend('room'), env); const oldSend = hook.result.current.sendText;
    state.session = { uid: 'bob', epoch: 2 }; state.user = { id: 'bob' }; hook.rerender();
    await expect(hook.result.current.sendText('Still old profile')).rejects.toMatchObject({ code: 'account-changed' });
    state.profile = { id: 'bob-profile', user_id: 'bob', username: 'bob' }; hook.rerender();
    await act(async () => { await hook.result.current.sendText('Bob draft'); await flush(); });
    expect(state.send.mock.calls[0][0].sender_id).toBe('bob-profile');
    await expect(oldSend('Alice draft')).rejects.toMatchObject({ code: 'account-changed' }); hook.unmount(); env.client.clear();
  });
  it('does not confirm or broadcast an old completion after the account changes', async () => {
    const reply = deferred<any>(); state.send.mockReturnValue(reply.promise); const env = context(); const hook = renderHook(() => useInstantSend('room'), env);
    let sending!: Promise<unknown>; act(() => { sending = hook.result.current.sendMedia('gs://bucket/alice/photo', 'image'); }); await flush();
    state.session = { uid: 'bob', epoch: 2 }; state.user = { id: 'bob' }; state.profile = { id: 'bob-profile', user_id: 'bob', username: 'bob' }; hook.rerender();
    await act(async () => { reply.resolve({ data: { id: 'saved' }, error: null }); await expect(sending).rejects.toMatchObject({ code: 'account-changed' }); });
    expect(state.broadcast).toHaveBeenCalledTimes(1); expect(env.client.getQueryData(messagesQueryKey('room', state.session))).toBeUndefined();
    expect(state.enqueue).not.toHaveBeenCalled(); hook.unmount(); env.client.clear();
  });
  it('stops a video after upload if the initiating view was unmounted', async () => {
    const reply = deferred<any>(); state.upload.mockReturnValue(reply.promise); const env = context(); const hook = renderHook(() => useInstantSend('room'), env);
    let sending!: Promise<unknown>; act(() => { sending = hook.result.current.sendVideo(new File(['data'], 'clip.mp4'), 'preview', 1); });
    expect(state.upload.mock.calls[0][0]).toMatch(/^alice\//); hook.unmount();
    reply.resolve({ data: {}, error: null }); await expect(sending).rejects.toMatchObject({ code: 'account-changed' });
    expect(state.publicUrl).not.toHaveBeenCalled(); expect(state.send).not.toHaveBeenCalled(); expect(state.broadcast).toHaveBeenCalledTimes(1); env.client.clear();
  });
  it('waits for durable queue acknowledgement before showing queued success', async () => {
    state.send.mockResolvedValue({ data: null, error: new Error('Offline') }); const saved = deferred<void>(); state.enqueue.mockReturnValue(saved.promise);
    const env = context(); const hook = renderHook(() => useInstantSend('room'), env);
    await act(async () => { await hook.result.current.sendText('Queue this'); await flush(); });
    expect(state.info).not.toHaveBeenCalled();
    await act(async () => { saved.resolve(); await flush(); }); expect(state.info).toHaveBeenCalledOnce();
    expect(state.enqueue.mock.calls[0][1]).toEqual(state.session); hook.unmount(); env.client.clear();
  });
});

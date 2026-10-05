import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1, invoke: vi.fn() }));
vi.mock('@/hooks/useProfileAccount', () => ({ useProfileAccount: () => {
  const { uid, epoch } = state;
  return { ready: !!uid, user: { id: uid }, profile: { id: uid, user_id: uid }, session: { uid, epoch }, guard: () => { if (state.uid !== uid || state.epoch !== epoch) throw new Error('account changed'); } };
} }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: state.invoke }));
import { useLocationShareWithFriend } from './useLocationShareWithFriend';
import { grant, locationRead, locationRequest, revision } from '@/test/locationSharingFixtures';
const clients: QueryClient[] = [];
function wrapper() { const client = new QueryClient({ defaultOptions: { queries: { retry: false, placeholderData: keepPreviousData, refetchOnMount: false, staleTime: Infinity, gcTime: 14 * 86400000 } } }); clients.push(client); return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
function read(input: Record<string, unknown>, extra = {}) { return { data: { ...locationRead({ targetId: input.targetId as string, locations: [], shares: [] }), ...extra, ok: true, ownerUid: input.expectedOwnerUid, profileId: input.expectedProfileId, action: input.action, requestId: input.requestId ?? null }, error: null }; }
beforeEach(() => { state.uid = 'alice'; state.epoch = 1; state.invoke.mockReset().mockImplementation(async (_, input) => read(input)); sessionStorage.clear(); });
afterEach(() => { cleanup(); clients.forEach(client => client.clear()); clients.length = 0; });
describe('friend location sharing lifecycle', () => {
  it('does not reuse previous target data while the next target loads', async () => {
    state.invoke.mockImplementationOnce(async (_, input) => read(input, { requests: [locationRequest()] })).mockImplementation(() => new Promise(() => {}));
    const hook = renderHook(({ target }) => useLocationShareWithFriend(target), { initialProps: { target: 'bob' }, wrapper: wrapper() });
    await waitFor(() => expect(hook.result.current.outgoingRequests).toHaveLength(1));
    hook.rerender({ target: 'carol' }); expect(hook.result.current.outgoingRequests).toEqual([]); expect(hook.result.current.isReady).toBe(false);
  });
  it('retains request identity after a lost reply and rejects foreign acknowledgement', async () => {
    const mutations: Record<string, unknown>[] = [];
    state.invoke.mockImplementation(async (_, input) => {
      if (input.action === 'read') return read(input);
      mutations.push(input);
      if (mutations.length === 1) return { data: null, error: { message: 'Reply lost', code: 'unavailable' } };
      return { data: { ok: true, ownerUid: input.expectedOwnerUid, profileId: input.expectedProfileId, action: 'request', requestId: input.requestId, serverTime: Date.now(), request: locationRequest() }, error: null };
    });
    const hook = renderHook(() => useLocationShareWithFriend('bob'), { wrapper: wrapper() }); await waitFor(() => expect(hook.result.current.isReady).toBe(true));
    await act(async () => { await expect(hook.result.current.requestShare.mutateAsync({})).rejects.toThrow('Reply lost'); });
    await act(async () => { await hook.result.current.requestShare.mutateAsync({}); });
    expect(mutations).toHaveLength(2); expect(mutations[1]).toEqual(mutations[0]); expect(mutations[1].expectedOwnerUid).toBe('alice');
  });
  it('retains directional paused controls separately from the incoming share', async () => {
    const outgoing = grant({ id: 'd'.repeat(64), sharerId: 'alice', viewerId: 'bob', paused: true });
    state.invoke.mockImplementation(async (_, input) => read(input, { shares: [grant(), outgoing] }));
    const hook = renderHook(() => useLocationShareWithFriend('bob'), { wrapper: wrapper() }); await waitFor(() => expect(hook.result.current.isReady).toBe(true));
    expect(hook.result.current.outgoingShare?.paused).toBe(true); expect(hook.result.current.incomingShare?.paused).toBe(false);
  });
  it('never accepts stale mutation success through target switch or account ABA', async () => {
    let finish!: (value: unknown) => void; let body!: Record<string, unknown>;
    state.invoke.mockImplementation(async (_, input) => {
      if (input.action === 'read') return read(input);
      body = input; return new Promise(resolve => { finish = resolve; });
    });
    const hook = renderHook(({ target }) => useLocationShareWithFriend(target), { initialProps: { target: 'bob' }, wrapper: wrapper() }); await waitFor(() => expect(hook.result.current.isReady).toBe(true));
    let pending!: Promise<unknown>;
    act(() => { pending = hook.result.current.requestShare.mutateAsync({}).catch(error => error); }); await waitFor(() => expect(finish).toBeDefined());
    act(() => { state.uid = 'carol'; state.epoch++; hook.rerender({ target: 'bob' }); });
    act(() => { state.uid = 'alice'; state.epoch++; hook.rerender({ target: 'carol' }); });
    await act(async () => { finish({ data: { ok: true, ownerUid: 'alice', profileId: 'alice', action: 'request', requestId: body.requestId, serverTime: Date.now(), request: locationRequest() }, error: null }); });
    expect(await pending).toBeInstanceOf(Error); expect(hook.result.current.outgoingRequests).toEqual([]);
  });
  it('uses the captured incoming request revision for accept without starting GPS', async () => {
    const incoming = locationRequest({ requesterId: 'bob', targetId: 'alice', requester: { id: 'bob', username: 'Bob', displayName: null, avatarUrl: null }, target: { id: 'alice', username: 'Alice', displayName: null, avatarUrl: null } });
    state.invoke.mockImplementation(async (_, input) => input.action === 'read' ? read(input, { requests: [incoming] }) : { data: { ok: true, ownerUid: 'alice', profileId: 'alice', action: 'respond', requestId: input.requestId, serverTime: Date.now(), request: { ...incoming, status: 'accepted', shareId: 'b'.repeat(64) }, share: grant({ sharerId: 'alice', viewerId: 'bob' }) }, error: null });
    const hook = renderHook(() => useLocationShareWithFriend('bob'), { wrapper: wrapper() }); await waitFor(() => expect(hook.result.current.incomingRequests).toHaveLength(1));
    await act(async () => { await hook.result.current.respondRequest.mutateAsync({ request: hook.result.current.incomingRequests[0], intent: 'accept' }); });
    const body = state.invoke.mock.calls.find(([, body]) => body.action === 'respond')![1]; expect(body.expectedRevision).toBe(revision); expect(body.locationRequestId).toBe(incoming.id);
    expect(state.invoke.mock.calls.some(([, body]) => ['setSharing', 'publishPosition'].includes(body.action))).toBe(false);
  });
  it('represents a failed read as unavailable and refuses requests until retry', async () => {
    state.invoke.mockResolvedValue({ data: null, error: { message: 'Sharing unavailable' } });
    const hook = renderHook(() => useLocationShareWithFriend('bob'), { wrapper: wrapper() }); await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.isReady).toBe(false); await expect(hook.result.current.requestShare.mutateAsync({})).rejects.toThrow('Refresh');
    expect(state.invoke).toHaveBeenCalledOnce();
  });
});

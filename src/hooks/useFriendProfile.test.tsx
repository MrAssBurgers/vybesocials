import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ user: { id: 'alice' }, profile: { id: 'a-profile', user_id: 'alice', username: 'target' },
  auth: { currentUser: { uid: 'alice' } as { uid: string } | null, onAuthStateChanged: vi.fn() }, read: vi.fn(), single: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: state.user, profile: state.profile }) }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => state.auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: (name: string) => ({ single: () => state.single(name) }) }));
vi.mock('@/lib/firebase/firestoreDb', () => ({ getDocumentsFromServer: state.read, getDocumentFromServer: vi.fn(), where: (...args: unknown[]) => args, firestoreLimit: (n: number) => n }));
vi.mock('@/lib/friendRequestNotice', () => ({ ensureFriendRequestNotice: vi.fn() }));
import { ensureFriendRequestNotice } from '@/lib/friendRequestNotice';
import { useFriendProfile } from './useFriendProfile';
import { PROFILE_VISIBILITY_FIELDS } from '@/lib/profileVisibility';
import { reportAccountSnapshot } from '@/lib/reportModerationService';
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; };
const response = () => ({ data: { ok: true, ownerUid: 'alice', viewerProfileId: 'a-profile', targetProfileId: 'target',
  fields: Object.fromEntries(PROFILE_VISIBILITY_FIELDS.map(field => [field, true])), settings: Object.fromEntries(PROFILE_VISIBILITY_FIELDS.map(field => [field, 'friends'])),
  isSelf: false, isFriend: true, isBlocked: false }, error: null });
let client: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
beforeEach(() => { vi.clearAllMocks(); client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  state.user = { id: 'alice' }; state.profile = { id: 'a-profile', user_id: 'alice', username: 'target' }; state.auth.currentUser = { uid: 'alice' }; reportAccountSnapshot();
  state.read.mockResolvedValue([{ id: 'target', user_id: 'target-uid', username: 'target', bio: 'private biography' }]); state.single.mockResolvedValue(response());
});
afterEach(() => { cleanup(); client.clear(); });
describe('mounted profile authority', () => {
  it('keeps private profile and fields unavailable until the first permission response', async () => {
    const pending = deferred<unknown>(); state.single.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useFriendProfile('target'), { wrapper });
    await waitFor(() => expect(state.single).toHaveBeenCalled());
    expect(result.current.profile).toBeNull(); expect(result.current.visibility).toBeUndefined(); expect(result.current.isSelf).toBe(false);
    expect(state.read.mock.calls.every(call => call[0] === 'profiles')).toBe(true);
    await act(async () => { pending.resolve(response()); });
    await waitFor(() => expect(result.current.profile?.bio).toBe('private biography'));
    expect(result.current.isSelf).toBe(false); // Equal usernames never grant self.
  });
  it('hides a previous successful result on a refetch failure without replacing it with defaults', async () => {
    const { result } = renderHook(() => useFriendProfile('target'), { wrapper });
    await waitFor(() => expect(result.current.visibility?.posts).toBe(true));
    state.single.mockResolvedValue({ error: { message: 'offline' } });
    await act(async () => { await client.refetchQueries({ queryKey: ['profile-visibility-resolved'] }); });
    await waitFor(() => expect(result.current.visibilityError).toBe(true));
    expect(result.current.profile).toBeNull(); expect(result.current.visibility).toBeUndefined();
    const data = client.getQueriesData<{ fields: Record<string, boolean> }>({ queryKey: ['profile-visibility-resolved'] }).find(([, value]) => value)?.[1];
    expect(data?.fields.posts).toBe(true);
  });
  it('refuses stale AuthProvider profile paired with a new native UID', async () => {
    state.auth.currentUser = { uid: 'bob' }; reportAccountSnapshot();
    const { result } = renderHook(() => useFriendProfile('target'), { wrapper });
    expect(result.current.profile).toBeNull(); expect(result.current.profileError).toBe(true); expect(state.read).not.toHaveBeenCalled(); expect(state.single).not.toHaveBeenCalled();
  });
  it('rejects delayed permission completion across A to B to A and waits for a new read', async () => {
    const old = deferred<unknown>(), current = deferred<unknown>(); state.single.mockReturnValueOnce(old.promise).mockReturnValue(current.promise);
    const { result, rerender } = renderHook(() => useFriendProfile('target'), { wrapper });
    await waitFor(() => expect(state.single).toHaveBeenCalledTimes(1));
    act(() => { state.auth.currentUser = { uid: 'bob' }; reportAccountSnapshot(); state.auth.currentUser = { uid: 'alice' }; reportAccountSnapshot(); rerender(); });
    await waitFor(() => expect(state.single).toHaveBeenCalledTimes(2));
    await act(async () => { old.resolve(response()); }); expect(result.current.profile).toBeNull();
    await act(async () => { current.resolve(response()); }); await waitFor(() => expect(result.current.profile?.id).toBe('target'));
  });
  it('shows an incoming request from the friendship callable when the client request query is empty', async () => {
    const visible = response();
    visible.data.isFriend = false;
    visible.data.settings = Object.fromEntries(Object.keys(visible.data.settings).map((field) => [field, 'public']));
    state.single.mockImplementation((name: string) => Promise.resolve(name === 'get-friendship-state'
      ? { data: { state: 'pending_incoming', request_id: 'alice_target' }, error: null }
      : visible));
    state.read.mockImplementation((table: string) => Promise.resolve(table === 'friend_requests' ? [] : [{ id: 'target', user_id: 'target-uid', username: 'target', bio: 'private biography' }]));
    const { result } = renderHook(() => useFriendProfile('target'), { wrapper });
    await waitFor(() => expect(result.current.friendshipStatus).toBe('pending_received'));
    expect(result.current.isPendingRequest).toBe(true);
    expect(ensureFriendRequestNotice).not.toHaveBeenCalled();
  });
  it('writes a recipient notice when the server says the request is outgoing', async () => {
    const visible = response();
    visible.data.isFriend = false;
    visible.data.settings = Object.fromEntries(Object.keys(visible.data.settings).map((field) => [field, 'public']));
    state.single.mockImplementation((name: string) => Promise.resolve(name === 'get-friendship-state'
      ? { data: { state: 'pending_outgoing', request_id: 'a-profile_target' }, error: null }
      : visible));
    state.read.mockImplementation((table: string) => Promise.resolve(table === 'friend_requests' ? [] : [{ id: 'target', user_id: 'target-uid', username: 'target', bio: 'private biography' }]));
    const { result } = renderHook(() => useFriendProfile('target'), { wrapper });
    await waitFor(() => expect(result.current.friendshipStatus).toBe('pending_sent'));
    expect(ensureFriendRequestNotice).toHaveBeenCalledWith('target', 'a-profile');
  });
  it('uses the direct request rows when the friendship callable fails', async () => {
    const visible = response();
    visible.data.isFriend = false;
    visible.data.settings = Object.fromEntries(Object.keys(visible.data.settings).map((field) => [field, 'public']));
    state.single.mockImplementation((name: string) => Promise.resolve(name === 'get-friendship-state'
      ? { data: null, error: { message: 'unavailable' } }
      : visible));
    state.read.mockImplementation((table: string, constraints: unknown[] = []) => {
      if (table !== 'friend_requests') return Promise.resolve([{ id: 'target', user_id: 'target-uid', username: 'target' }]);
      const sender = Array.isArray(constraints[0]) && constraints[0][0] === 'sender_id' && constraints[0][2] === 'a-profile';
      return Promise.resolve(sender ? [{ id: 'req' }] : []);
    });
    const { result } = renderHook(() => useFriendProfile('target'), { wrapper });
    await waitFor(() => expect(result.current.friendshipStatus).toBe('pending_sent'));
  });
});

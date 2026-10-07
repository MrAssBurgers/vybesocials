import type { PropsWithChildren } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  uid: 'alice', listener: null as null | ((user: { uid: string } | null) => void), load: vi.fn(), fetchConversation: vi.fn(), members: vi.fn(), profiles: vi.fn(),
}));
const auth = vi.hoisted(() => ({ get currentUser() { return { uid: state.uid }; }, onAuthStateChanged(listener: typeof state.listener) { state.listener = listener; return () => {}; } }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: state.uid }, profile: { id: `profile-${state.uid}`, user_id: state.uid }, authReady: true }) }));
vi.mock('@/hooks/useAuthProfileId', () => ({ useAuthProfileId: () => `profile-${state.uid}` }));
vi.mock('@/hooks/useFriends', () => ({ useFriends: () => ({ data: [], isLoading: false }) }));
vi.mock('@/lib/firebase', () => ({ db: { from: () => ({ select: () => ({ eq: state.members }) }) } }));
vi.mock('@/lib/firebase/profileResolve', () => ({ syncUserAuthIndex: vi.fn() }));
vi.mock('@/lib/firebase/users', () => ({ getProfileByAuthUid: vi.fn() }));
vi.mock('@/lib/firebase/chats', () => ({ listUserChats: vi.fn(), createDmChat: vi.fn() }));
vi.mock('@/lib/bugReportClient', () => ({ reportAppCrash: vi.fn() }));
vi.mock('@/lib/scheduleIdleWork', () => ({ scheduleIdleWork: () => () => {} }));
vi.mock('@/lib/resolveSessionProfileId', () => ({ syncSessionProfileId: (value: string) => value }));
vi.mock('@/lib/warmDmConversation', () => ({ warmDmConversationBatch: vi.fn() }));
vi.mock('@/lib/markConversationRead', () => ({ markConversationReadForViewer: vi.fn(), getSessionAuthUid: vi.fn(), maxLastReadAt: vi.fn() }));
vi.mock('@/lib/conversationMessagesQuery', () => ({ fetchLatestMessagePerConversation: vi.fn(), fetchMessagesForConversations: vi.fn() }));
vi.mock('@/lib/dmMembershipRepair', () => ({ fetchMemberProfiles: state.profiles, fetchConversationForViewer: state.fetchConversation, fetchConversationMetaForList: vi.fn(), syntheticDeterministicConversation: vi.fn(), normalizeToProfileId: vi.fn(), inferOtherParticipantId: vi.fn(() => 'profile-bob') }));
vi.mock('@/lib/loadDMConversations', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/loadDMConversations')>(), loadDMConversations: state.load }));
import { useConversationDetail, useDMConversations } from './useDMConversations';
import { dmListQueryKey, conversationDetailQueryKey } from '@/lib/dmAccountScope';
import { reportAccountSnapshot } from '@/lib/reportModerationService';
import { setActiveAuthUserId, setCachedCurrentProfile } from '@/lib/profileCache';

const conv = { id: 'private-thread', member_ids: ['profile-alice', 'profile-bob'], members: [{ conversation_id: 'private-thread', user_id: 'profile-alice', profile: { id: 'profile-alice', username: 'alice' } }], last_message: { content: 'Alice private preview', created_at: '2026-10-04T00:00:00Z' } };
function switchTo(uid: string) {
  state.uid = uid;
  setActiveAuthUserId(uid);
  setCachedCurrentProfile({ id: `profile-${uid}`, user_id: uid, username: uid, display_name: uid, avatar_url: null });
  state.listener?.({ uid });
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
beforeEach(() => {
  localStorage.clear(); switchTo('alice'); reportAccountSnapshot();
  state.load.mockReset().mockImplementation(async () => ({ data: [], error: null, profileId: `profile-${state.uid}` }));
  state.fetchConversation.mockReset(); state.members.mockReset().mockResolvedValue({ data: [], error: null });
  state.profiles.mockReset().mockResolvedValue(new Map());
});
afterEach(cleanup);

describe('DM views stay with the authenticated account', () => {
  it('keeps a chat pinned when the viewer membership uses the sign-in ID', async () => {
    const { client, wrapper } = setup();
    state.load.mockResolvedValue({ data: [{ ...conv, members: [{ conversation_id: conv.id, user_id: 'alice', is_pinned: true }] }], error: null, profileId: 'profile-alice' });
    const hook = renderHook(() => useDMConversations(), { wrapper });
    await waitFor(() => expect(hook.result.current.isFetched).toBe(true));
    expect(hook.result.current.pinnedConversations.map(row => row.id)).toEqual([conv.id]);
    expect(hook.result.current.unpinnedConversations).toEqual([]);
    // A realtime/cache update must move it back without reopening Messages.
    act(() => client.setQueryData(dmListQueryKey('profile-alice'), [{ ...conv, members: [{ conversation_id: conv.id, user_id: 'alice', is_pinned: false }] }]));
    await waitFor(() => expect(hook.result.current.pinnedConversations).toEqual([]));
    expect(hook.result.current.unpinnedConversations.map(row => row.id)).toEqual([conv.id]);
    client.clear();
  });

  it('ignores a pin row belonging to a different conversation or participant', async () => {
    const { client, wrapper } = setup();
    state.load.mockResolvedValue({ data: [{ ...conv, members: [
      { conversation_id: 'another-thread', user_id: 'profile-alice', is_pinned: true },
      { conversation_id: conv.id, user_id: 'profile-bob', is_pinned: true },
      { conversation_id: conv.id, user_id: 'alice', is_pinned: false },
    ] }], error: null, profileId: 'profile-alice' });
    const hook = renderHook(() => useDMConversations(), { wrapper });
    await waitFor(() => expect(hook.result.current.isFetched).toBe(true));
    expect(hook.result.current.pinnedConversations).toEqual([]);
    expect(hook.result.current.unpinnedConversations.map(row => row.id)).toEqual([conv.id]);
    client.clear();
  });

  it('prefers the current profile membership over a historical sign-in alias', async () => {
    const { client, wrapper } = setup();
    state.load.mockResolvedValue({ data: [{ ...conv, members: [
      { conversation_id: conv.id, user_id: 'alice', is_pinned: true },
      { conversation_id: conv.id, user_id: 'profile-alice', is_pinned: false },
    ] }], error: null, profileId: 'profile-alice' });
    const hook = renderHook(() => useDMConversations(), { wrapper });
    await waitFor(() => expect(hook.result.current.isFetched).toBe(true));
    expect(hook.result.current.pinnedConversations).toEqual([]);
    client.clear();
  });

  it('keeps empty and filtered list references stable across unrelated mounted renders', async () => {
    const { client, wrapper } = setup();
    const hook = renderHook(() => useDMConversations(), { wrapper });
    await waitFor(() => expect(hook.result.current.isFetched).toBe(true));
    const empty = hook.result.current.conversations;
    const pinned = hook.result.current.pinnedConversations;
    hook.rerender(); hook.rerender();
    expect(hook.result.current.conversations).toBe(empty);
    expect(hook.result.current.pinnedConversations).toBe(pinned);
    client.clear();
  });
  it('does not render the previous account list while a moderator request is pending', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(dmListQueryKey('profile-alice'), [conv]);
    client.setQueryData(['dm-conversations', 'profile-alice'], [conv]);
    switchTo('moderator');
    state.load.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useDMConversations(), { wrapper });
    expect(result.current.conversations).toEqual([]);
    await waitFor(() => expect(state.load).toHaveBeenCalledTimes(1));
    expect(result.current.conversations).toEqual([]);
    client.clear();
  });

  it('accepts an authoritative empty result instead of preserving an old list', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(dmListQueryKey('profile-alice'), [conv]);
    const { result } = renderHook(() => useDMConversations(), { wrapper });
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.conversations).toEqual([]));
    expect(client.getQueryData(dmListQueryKey('alice'))).toEqual([]);
    client.clear();
  });

  it('does not seed a delayed list into a later Alice session after an account round trip', async () => {
    const { client, wrapper } = setup();
    let resolve!: (value: unknown) => void;
    state.load.mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useDMConversations(), { wrapper });
    await waitFor(() => expect(state.load).toHaveBeenCalledTimes(1));
    act(() => { switchTo('moderator'); switchTo('alice'); });
    await act(async () => { resolve({ data: [conv], error: null, profileId: 'profile-alice' }); });
    expect(result.current.conversations).toEqual([]);
    expect(client.getQueryData(dmListQueryKey('profile-alice'))).toBeUndefined();
    client.clear();
  });

  it('does not hydrate an outsider thread header or inspect members after a denied parent', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(dmListQueryKey('profile-alice'), [conv]);
    client.setQueryData(['conversation-detail', conv.id], conv);
    switchTo('moderator');
    state.fetchConversation.mockResolvedValue(conv);
    const { result } = renderHook(() => useConversationDetail(conv.id), { wrapper });
    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ code: 'permission-denied' });
    expect(state.members).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
    client.clear();
  });

  it('ignores a delayed thread detail after Alice leaves and returns', async () => {
    const { client, wrapper } = setup();
    let resolve!: (value: unknown) => void;
    state.fetchConversation.mockImplementationOnce(() => new Promise(done => { resolve = done; })).mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useConversationDetail(conv.id), { wrapper });
    await waitFor(() => expect(state.fetchConversation).toHaveBeenCalledTimes(1));
    act(() => { switchTo('moderator'); switchTo('alice'); });
    await act(async () => { resolve(conv); });
    expect(result.current.data).toBeUndefined();
    expect(state.members).not.toHaveBeenCalled();
    expect(client.getQueryData(conversationDetailQueryKey(conv.id))).toBeUndefined();
    client.clear();
  });

  it.each(['profile-alice', 'alice'])('allows a legacy parent using a matching stored %s membership tuple', async memberId => {
    const { client, wrapper } = setup();
    state.fetchConversation.mockResolvedValue({ id: conv.id, is_group: true, name: 'Legacy group' });
    state.members.mockResolvedValue({ data: [{ conversation_id: conv.id, user_id: memberId }], error: null });
    const { result } = renderHook(() => useConversationDetail(conv.id), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ name: 'Legacy group', members: [{ conversation_id: conv.id, user_id: memberId }] });
    client.clear();
  });

  it('does not accept an alias on a member row bound to another conversation', async () => {
    const { client, wrapper } = setup();
    state.fetchConversation.mockResolvedValue({ id: conv.id, is_group: true });
    state.members.mockResolvedValue({ data: [{ conversation_id: 'another-thread', user_id: 'profile-alice' }], error: null });
    const { result } = renderHook(() => useConversationDetail(conv.id), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    expect(state.profiles).not.toHaveBeenCalled();
    client.clear();
  });
});

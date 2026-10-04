import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ uid: 'alice', listener: null as null | ((user: { uid: string } | null) => void) }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => auth }));
const auth = { get currentUser() { return { uid: state.uid }; }, onAuthStateChanged(listener: typeof state.listener) { state.listener = listener; return () => {}; } };
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
vi.mock('@/lib/firebase/profileResolve', () => ({ syncUserAuthIndex: vi.fn() }));
vi.mock('@/lib/firebase/users', () => ({ getProfileByAuthUid: vi.fn() }));
vi.mock('@/lib/firebase/chats', () => ({ listUserChats: vi.fn() }));
vi.mock('@/lib/bugReportClient', () => ({ reportAppCrash: vi.fn() }));
vi.mock('@/lib/conversationMessagesQuery', () => ({ fetchLatestMessagePerConversation: vi.fn(), fetchMessagesForConversations: vi.fn() }));
vi.mock('@/lib/dmMembershipRepair', () => ({ fetchMemberProfiles: vi.fn(), fetchConversationMetaForList: vi.fn(), syntheticDeterministicConversation: vi.fn(), normalizeToProfileId: vi.fn(), inferOtherParticipantId: vi.fn() }));
import { reportAccountSnapshot } from './reportModerationService';
import { setCachedCurrentProfile, setActiveAuthUserId } from './profileCache';
import { dmListQueryKey, ownedDmProfileId } from './dmAccountScope';
import { readDmConversationsCache, seedDmConversationsCache, syncDmListCaches, type LoadedDMConversation } from './loadDMConversations';

const conversation = { id: 'alice_bob', member_ids: ['profile-alice', 'profile-bob'], members: [], last_message: { content: 'Private Alice and Bob message' } } as unknown as LoadedDMConversation;
function switchTo(uid: string) {
  state.uid = uid;
  state.listener?.({ uid });
  setActiveAuthUserId(uid);
  setCachedCurrentProfile({ id: `profile-${uid}`, user_id: uid, username: uid, display_name: uid, avatar_url: null });
}
beforeEach(() => { localStorage.clear(); switchTo('alice'); reportAccountSnapshot(); });

describe('private DM cache ownership', () => {
  it('does not borrow another account list or seed it onto a moderator key', () => {
    const qc = new QueryClient();
    syncDmListCaches(qc, 'profile-alice', [conversation]);
    qc.setQueryData(['dm-conversations', 'profile-alice'], [conversation]);
    switchTo('moderator');
    expect(readDmConversationsCache(qc, 'profile-moderator', 'moderator')).toEqual([]);
    expect(seedDmConversationsCache(qc, 'profile-moderator', 'moderator')).toEqual([]);
    expect(qc.getQueryData(dmListQueryKey('profile-moderator'))).toBeUndefined();
    qc.clear();
  });

  it('supports current UID and verified profile aliases without reading old unscoped snapshots', () => {
    const qc = new QueryClient();
    qc.setQueryData(['dm-conversations', 'profile-alice'], [conversation]);
    expect(readDmConversationsCache(qc, 'profile-alice', 'alice')).toEqual([]);
    syncDmListCaches(qc, 'alice', [conversation]);
    expect(readDmConversationsCache(qc, 'profile-alice', 'alice')).toHaveLength(1);
    expect(readDmConversationsCache(qc, 'profile-alice', 'moderator')).toEqual([]);
    qc.clear();
  });

  it('does not accept an unknown or foreign disk profile as the current account alias', () => {
    const qc = new QueryClient();
    setCachedCurrentProfile({ id: 'profile-unknown', username: 'Unknown', display_name: null, avatar_url: null });
    expect(ownedDmProfileId('alice')).toBeUndefined();
    expect(ownedDmProfileId('alice', { id: 'profile-bob', user_id: 'bob' })).toBeUndefined();
    qc.setQueryData(dmListQueryKey('profile-unknown'), [conversation]);
    expect(readDmConversationsCache(qc, 'profile-unknown', 'alice')).toEqual([]);
    qc.clear();
  });

  it('rejects poisoned own-key data whose stored parent excludes the viewer', () => {
    const qc = new QueryClient();
    switchTo('moderator');
    qc.setQueryData(dmListQueryKey('profile-moderator'), [{ ...conversation, members: [{ conversation_id: conversation.id, user_id: 'moderator' }] }]);
    expect(readDmConversationsCache(qc, 'profile-moderator', 'moderator')).toEqual([]);
    qc.clear();
  });

  it('ignores old epoch data and rejects late writes after Alice returns', () => {
    const qc = new QueryClient();
    const oldSession = reportAccountSnapshot();
    syncDmListCaches(qc, 'profile-alice', [conversation], oldSession);
    switchTo('bob'); switchTo('alice');
    expect(readDmConversationsCache(qc, 'profile-alice', 'alice')).toEqual([]);
    syncDmListCaches(qc, 'profile-alice', [conversation], oldSession);
    expect(qc.getQueryData(dmListQueryKey('profile-alice'))).toBeUndefined();
    expect(readDmConversationsCache(qc, 'profile-alice', 'alice', oldSession)).toEqual([]);
    qc.clear();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ conversations: [] as any[], messages: [] as any[], hidden: [] as any[], trashed: [] as any[], profiles: new Map<string, any>() }));
vi.mock('@/lib/firebase', () => ({ db: { from(table: string) {
  const filters: Record<string, unknown> = {};
  const result = () => ({ data: table === 'conversations' ? state.conversations.find(c => c.id === filters.id) : table === 'conversation_members' ? state.conversations.flatMap(c => c.member_ids.map((user_id: string) => ({ conversation_id: c.id, user_id, last_read_at: null }))).filter(row => !filters.user_id || row.user_id === filters.user_id) : table === 'hidden_conversations' ? state.hidden : table === 'trashed_conversations' ? state.trashed : [], error: null });
  const query: any = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; }, in: () => query, maybeSingle: async () => result(), then: (resolve: any) => Promise.resolve(result()).then(resolve) }; return query;
} } }));
vi.mock('@/lib/auth', () => ({ waitForAuthSession: async () => ({ user: { id: 'viewer' } }) }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => ({ uid: 'viewer', epoch: 1 }), reportAccountGuard: () => () => {}, isReportSessionError: () => false }));
vi.mock('@/lib/profileCache', () => ({ getCachedCurrentProfile: () => ({ id: 'viewer', user_id: 'viewer' }), getCachedProfile: () => null, setCachedProfile: () => {} }));
vi.mock('@/lib/firebase/users', () => ({ getProfileByAuthUid: async () => ({ id: 'viewer', user_id: 'viewer', username: 'viewer' }) }));
vi.mock('@/lib/firebase/profileResolve', () => ({ syncUserAuthIndex: async () => {} }));
vi.mock('@/lib/firebase/chats', () => ({ listUserChats: async () => [] }));
vi.mock('@/lib/bugReportClient', () => ({ reportAppCrash: () => {} }));
vi.mock('@/lib/dmMembershipRepair', () => ({ fetchMemberProfiles: async () => state.profiles, fetchConversationMetaForList: async () => null, syntheticDeterministicConversation: () => null, normalizeToProfileId: async (id: string) => id, inferOtherParticipantId: () => null }));
vi.mock('@/lib/conversationMessagesQuery', () => ({ fetchMessagesForConversations: async () => ({ data: state.messages, error: null }), fetchLatestMessagePerConversation: async () => ({ data: state.messages, error: null }) }));
vi.mock('@/lib/markConversationRead', () => ({ maxLastReadAt: () => null }));
import { loadDMConversations } from './loadDMConversations';
const conversation = (id: string, peer: string) => ({ id, is_group: false, member_ids: ['viewer', peer], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' });
const message = (id: string, at: string) => ({ id: `message-${id}`, conversation_id: id, sender_id: 'peer', content: `history in ${id}`, created_at: at });
beforeEach(() => { state.conversations = []; state.messages = []; state.hidden = []; state.trashed = []; state.profiles = new Map([['viewer', { id: 'viewer', user_id: 'viewer', username: 'viewer' }], ['peer-a', { id: 'peer-a', username: 'alex' }], ['peer-b', { id: 'peer-b', username: 'alex' }]]); });
describe('distinct permitted inbox histories', () => {
  it('retains different histories for the same peer and sorts by their messages', async () => {
    state.conversations = [conversation('older-thread', 'peer-a'), conversation('newer-thread', 'peer-a')];
    state.messages = [message('older-thread', '2026-09-01T00:00:00Z'), message('newer-thread', '2026-10-01T00:00:00Z')];
    const result = await loadDMConversations('viewer');
    expect(result.error).toBeNull(); expect(result.data.map(c => c.id)).toEqual(['newer-thread', 'older-thread']);
    expect(result.data.map(c => c.last_message?.content)).toEqual(['history in newer-thread', 'history in older-thread']);
  });
  it('does not treat a shared display username as conversation identity', async () => {
    state.conversations = [conversation('a', 'peer-a'), conversation('b', 'peer-b')]; state.messages = [message('a', '2026-10-01T00:00:00Z'), message('b', '2026-09-01T00:00:00Z')];
    const result = await loadDMConversations('viewer'); expect(result.error).toBeNull(); expect(result.data.map(c => c.id)).toEqual(['a', 'b']);
  });
  it('still excludes hidden, trashed and foreign-member conversations', async () => {
    state.conversations = [conversation('shown', 'peer-a'), conversation('hidden', 'peer-a'), conversation('trashed', 'peer-a'), { ...conversation('foreign', 'peer-a'), member_ids: ['peer-a','peer-b'] }];
    state.hidden = [{ conversation_id: 'hidden' }]; state.trashed = [{ conversation_id: 'trashed' }]; state.messages = [message('shown', '2026-10-01T00:00:00Z')];
    const result = await loadDMConversations('viewer'); expect(result.error).toBeNull(); expect(result.data.map(c => c.id)).toEqual(['shown']);
  });
});

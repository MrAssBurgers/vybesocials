import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ uid: 'alice', listener: null as null | ((user: { uid: string }) => void), idle: [] as (() => void)[], load: vi.fn() }));
const auth = vi.hoisted(() => ({ get currentUser() { return { uid: state.uid }; }, onAuthStateChanged(listener: typeof state.listener) { state.listener = listener; return () => {}; } }));
vi.mock('@/lib/firebase/authService', () => ({ getFirebaseAuth: () => auth }));
vi.mock('@/lib/firebase/functionsService', () => ({ invokeFunction: vi.fn() }));
vi.mock('@/lib/profileCache', () => ({ getCachedCurrentProfile: () => ({ id: `profile-${state.uid}`, user_id: state.uid }), getCachedProfile: (id: string) => ({ id, user_id: id.replace('profile-', '') }), enrichProfileAvatar: (value: unknown) => value }));
vi.mock('@/lib/loadDMConversations', () => ({ readDmConversationsCache: () => [] }));
vi.mock('@/lib/dmBroadcast', () => ({ prewarmDmBroadcastChannel: vi.fn() }));
vi.mock('@/lib/dmThreadDebug', () => ({ dmThreadLog: vi.fn() }));
vi.mock('@/lib/loadConversationMessages', () => ({ loadConversationMessages: state.load, MESSAGE_FETCH_TIMEOUT_MS: 1000, MESSAGE_SELECT_WARM: '*' }));
vi.mock('@/lib/conversationMessagesQuery', () => ({ CHAT_INITIAL_MESSAGE_LIMIT: 200 }));
vi.mock('@/lib/scheduleIdleWork', () => ({ scheduleIdleWork: (callback: () => void) => { state.idle.push(callback); return () => {}; } }));
import { findCachedDmConversation, seedConversationDetailCache, seedMessagesFromInboxPreview, warmDmConversation, warmDmConversationBatch } from './warmDmConversation';
import { messagesQueryKey } from './messagesQueryKey';
import { conversationDetailQueryKey } from './dmAccountScope';
import { reportAccountSnapshot } from './reportModerationService';

const conv = { id: 'private-cid', member_ids: ['profile-alice', 'profile-bob'], members: [], last_message: { id: 'm1', conversation_id: 'private-cid', content: 'Private preview', created_at: '2026-10-04T00:00:00Z' } };
function switchTo(uid: string) { state.uid = uid; state.listener?.({ uid }); }
beforeEach(() => { switchTo('alice'); reportAccountSnapshot(); state.idle = []; state.load.mockReset(); });

describe('conversation warming retains its initiating account', () => {
  it('does not seed or find an outsider header/message from a foreign hint or legacy list', () => {
    const qc = new QueryClient();
    qc.setQueryData(['dm-conversations', 'profile-alice'], [conv]);
    switchTo('moderator');
    seedConversationDetailCache(qc, conv.id, 'profile-moderator', conv as never);
    seedMessagesFromInboxPreview(qc, conv.id, 'profile-moderator', conv);
    expect(findCachedDmConversation(qc, conv.id, 'profile-moderator')).toBeUndefined();
    expect(qc.getQueryData(conversationDetailQueryKey(conv.id))).toBeUndefined();
    expect(qc.getQueryData(messagesQueryKey(conv.id))).toBeUndefined();
    qc.clear();
  });

  it('seeds a matching own conversation, but never a preview bound to another conversation', () => {
    const qc = new QueryClient();
    seedConversationDetailCache(qc, conv.id, 'profile-alice', conv as never);
    seedMessagesFromInboxPreview(qc, conv.id, 'profile-alice', { ...conv, last_message: { ...conv.last_message, conversation_id: 'another-private-chat' } });
    expect(qc.getQueryData(messagesQueryKey(conv.id))).toBeUndefined();
    seedMessagesFromInboxPreview(qc, conv.id, 'profile-alice', conv);
    expect(qc.getQueryData(conversationDetailQueryKey(conv.id))).toMatchObject({ id: conv.id });
    expect(qc.getQueryData(messagesQueryKey(conv.id))).toMatchObject([{ content: 'Private preview' }]);
    qc.clear();
  });

  it.each(['single', 'batch'])('cancels %s idle warming after an account round trip', mode => {
    const qc = new QueryClient();
    if (mode === 'single') warmDmConversation(qc, conv.id, 'profile-alice');
    else warmDmConversationBatch(qc, [conv.id], 'profile-alice');
    expect(state.idle.length).toBeGreaterThan(0);
    switchTo('moderator'); switchTo('alice');
    state.idle.splice(0).forEach(run => run());
    expect(state.load).not.toHaveBeenCalled();
    qc.clear();
  });

  it('does not publish a late warming result into the new session', async () => {
    const qc = new QueryClient();
    let resolve!: (value: unknown[]) => void;
    state.load.mockImplementation(() => new Promise(done => { resolve = done; }));
    warmDmConversation(qc, conv.id, 'profile-alice', 'profile-alice', 'high');
    expect(state.load).toHaveBeenCalledTimes(1);
    switchTo('moderator'); switchTo('alice');
    resolve([{ content: 'Old private data' }]);
    await vi.waitFor(() => expect(qc.isFetching()).toBe(0));
    expect(qc.getQueryData(messagesQueryKey(conv.id))).toBeUndefined();
    qc.clear();
  });
});

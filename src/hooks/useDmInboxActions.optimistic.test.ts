import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  patchDmConversationInCache,
  patchDmMemberInCache,
  removeDmConversationFromCache,
  patchLockedChatsCache,
} from '@/lib/dmInboxCachePatch';
const state = vi.hoisted(() => ({ uid: 'alice', epoch: 1 }));
vi.mock('@/lib/reportModerationService', () => ({ reportAccountSnapshot: () => ({ uid: state.uid, epoch: state.epoch }) }));
vi.mock('@/lib/profileCache', () => ({ getCachedCurrentProfile: () => ({ id: 'me', user_id: 'alice' }), getCachedProfile: () => null }));
import { dmListQueryKey } from '@/lib/dmAccountScope';
import { snapshotDmInbox } from '@/lib/dmInboxCachePatch';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';

const profileId = 'me';
const convId = 'conv-1';

function seedList(qc: QueryClient, list: LoadedDMConversation[]) {
  qc.setQueryData(dmListQueryKey(profileId), list);
}

describe('dmInboxCachePatch', () => {
  let qc: QueryClient;

  beforeEach(() => {
    state.uid = 'alice'; state.epoch = 1;
    qc = new QueryClient();
    seedList(qc, [
      {
        id: convId,
        unread_count: 2,
        _hasUnread: true,
        members: [{ conversation_id: convId, user_id: profileId, is_pinned: false, is_muted: false }],
      } as LoadedDMConversation,
    ]);
  });

  it('patches unread state optimistically', () => {
    patchDmConversationInCache(qc, profileId, convId, {
      unread_count: 0,
      _hasUnread: false,
    });
    const list = qc.getQueryData<LoadedDMConversation[]>(dmListQueryKey(profileId));
    expect(list?.[0].unread_count).toBe(0);
    expect(list?.[0]._hasUnread).toBe(false);
  });

  it('patches member pin/mute', () => {
    patchDmMemberInCache(qc, profileId, convId, { is_pinned: true, is_muted: true });
    const list = qc.getQueryData<LoadedDMConversation[]>(dmListQueryKey(profileId));
    const member = list?.[0].members?.[0] as { is_pinned?: boolean; is_muted?: boolean };
    expect(member.is_pinned).toBe(true);
    expect(member.is_muted).toBe(true);
  });

  it('removes archived conversation from list', () => {
    removeDmConversationFromCache(qc, profileId, convId);
    const list = qc.getQueryData<LoadedDMConversation[]>(dmListQueryKey(profileId));
    expect(list).toHaveLength(0);
  });

  it('patches both exact list aliases without touching legacy, other accounts or epochs', () => {
    const scoped = ['conversations', profileId, 'alice', 1];
    const original = qc.getQueryData(dmListQueryKey(profileId));
    qc.setQueryData(scoped, original);
    const excluded = [['dm-conversations', profileId], ['conversations'], ['dm-conversations', profileId, 'bob', 1], ['dm-conversations', profileId, 'alice', 0]];
    excluded.forEach(key => qc.setQueryData(key, original));
    patchDmConversationInCache(qc, profileId, convId, { unread_count: 0 });
    expect(qc.getQueryData<LoadedDMConversation[]>(scoped)?.[0].unread_count).toBe(0);
    excluded.forEach(key => expect(qc.getQueryData(key)).toEqual(original));
    expect(qc.getQueryData(dmListQueryKey('alice'))).toBeUndefined();
  });

  it('updates an owned profile list when a realtime writer starts with the auth UID', () => {
    patchDmConversationInCache(qc, 'alice', convId, { unread_count: 0 });
    expect(qc.getQueryData<LoadedDMConversation[]>(dmListQueryKey(profileId))?.[0].unread_count).toBe(0);
    expect(qc.getQueryData(dmListQueryKey('alice'))).toBeUndefined();
  });

  it('restores failed optimistic removal and leaves later deliveries intact', () => {
    const before = qc.getQueryData(dmListQueryKey(profileId));
    const rollback = snapshotDmInbox(qc, profileId, { uid: 'alice', epoch: 1 });
    removeDmConversationFromCache(qc, profileId, convId); rollback.capture(); rollback.restore();
    expect(qc.getQueryData(dmListQueryKey(profileId))).toEqual(before);
    patchDmConversationInCache(qc, profileId, convId, { unread_count: 0 }); rollback.capture();
    patchDmConversationInCache(qc, profileId, convId, { unread_count: 7 }); rollback.restore();
    expect(qc.getQueryData<LoadedDMConversation[]>(dmListQueryKey(profileId))?.[0].unread_count).toBe(7);
  });

  it('rejects writes and rollback after an account leaves and returns', () => {
    const session = { uid: 'alice', epoch: 1 };
    const oldKey = dmListQueryKey(profileId, session);
    const rollback = snapshotDmInbox(qc, profileId, session);
    removeDmConversationFromCache(qc, profileId, convId, session); rollback.capture();
    state.uid = 'bob'; state.epoch = 2;
    patchDmConversationInCache(qc, 'me', convId, { unread_count: 5 }, session);
    state.uid = 'alice'; state.epoch = 3;
    qc.setQueryData(dmListQueryKey(profileId), [{ id: 'new-chat' }]);
    rollback.restore();
    expect(qc.getQueryData(oldKey)).toEqual([]);
    expect(qc.getQueryData(dmListQueryKey(profileId))).toEqual([{ id: 'new-chat' }]);
  });

  it('updates locked chat set' , () => {
    patchLockedChatsCache(qc, profileId, convId, true);
    const locked = qc.getQueryData<Set<string>>(['locked-chats', profileId, 'alice', 1]);
    expect(locked?.has(convId)).toBe(true);
    patchLockedChatsCache(qc, profileId, convId, false);
    expect(qc.getQueryData<Set<string>>(['locked-chats', profileId, 'alice', 1])?.has(convId)).toBe(false);
  });
});

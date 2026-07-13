import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  patchDmConversationInCache,
  patchDmMemberInCache,
  removeDmConversationFromCache,
  patchLockedChatsCache,
} from '@/lib/dmInboxCachePatch';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';

const profileId = 'me';
const convId = 'conv-1';

function seedList(qc: QueryClient, list: LoadedDMConversation[]) {
  qc.setQueryData(['dm-conversations', profileId], list);
}

describe('dmInboxCachePatch', () => {
  let qc: QueryClient;

  beforeEach(() => {
    qc = new QueryClient();
    seedList(qc, [
      {
        id: convId,
        unread_count: 2,
        _hasUnread: true,
        members: [{ user_id: profileId, is_pinned: false, is_muted: false }],
      } as LoadedDMConversation,
    ]);
  });

  it('patches unread state optimistically', () => {
    patchDmConversationInCache(qc, profileId, convId, {
      unread_count: 0,
      _hasUnread: false,
    });
    const list = qc.getQueryData<LoadedDMConversation[]>(['dm-conversations', profileId]);
    expect(list?.[0].unread_count).toBe(0);
    expect(list?.[0]._hasUnread).toBe(false);
  });

  it('patches member pin/mute', () => {
    patchDmMemberInCache(qc, profileId, convId, { is_pinned: true, is_muted: true });
    const list = qc.getQueryData<LoadedDMConversation[]>(['dm-conversations', profileId]);
    const member = list?.[0].members?.[0] as { is_pinned?: boolean; is_muted?: boolean };
    expect(member.is_pinned).toBe(true);
    expect(member.is_muted).toBe(true);
  });

  it('removes archived conversation from list', () => {
    removeDmConversationFromCache(qc, profileId, convId);
    const list = qc.getQueryData<LoadedDMConversation[]>(['dm-conversations', profileId]);
    expect(list).toHaveLength(0);
  });

  it('updates locked chat set', () => {
    patchLockedChatsCache(qc, profileId, convId, true);
    const locked = qc.getQueryData<Set<string>>(['locked-chats', profileId]);
    expect(locked?.has(convId)).toBe(true);
    patchLockedChatsCache(qc, profileId, convId, false);
    expect(qc.getQueryData<Set<string>>(['locked-chats', profileId])?.has(convId)).toBe(false);
  });
});

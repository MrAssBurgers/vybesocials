import type { Message } from '@/hooks/useMessages';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import {
  getInboxLatestMessageAt,
  sortInboxConversations,
  toInboxSortable,
  compareInboxSortables,
} from '@/lib/sortInboxConversations';

type SortableConversation = Pick<
  LoadedDMConversation,
  'id' | 'created_at' | 'updated_at' | 'last_message' | 'members'
> & { _sortTime?: string | null };

/** Message activity only — never conversation.updated_at (bumped on view/repair). */
export function getDmConversationSortTime(conv: SortableConversation): string {
  return getInboxLatestMessageAt(conv as LoadedDMConversation);
}

/** Pinned first (pinOrder), then latest message activity, then id. Unread/presence ignored. */
export function compareDmConversations(
  a: SortableConversation,
  b: SortableConversation,
  profileId?: string | null,
): number {
  return compareInboxSortables(
    toInboxSortable(a as LoadedDMConversation, profileId),
    toInboxSortable(b as LoadedDMConversation, profileId),
  );
}

export function sortDmConversations<T extends SortableConversation>(
  list: T[],
  profileId?: string | null,
): T[] {
  return sortInboxConversations(list as unknown as LoadedDMConversation[], profileId) as unknown as T[];
}

/** Apply a new last message to a conversation row (send/receive paths). */
export function patchDmConversationActivity<T extends LoadedDMConversation>(
  conv: T,
  message: Pick<Message, 'id' | 'content' | 'media_type' | 'media_url' | 'message_type' | 'created_at' | 'sender_id'>,
): T {
  const activityAt = message.created_at;
  return {
    ...conv,
    last_message: {
      id: message.id,
      content: message.content,
      media_type: message.media_type,
      media_url: message.media_url ?? null,
      message_type: message.message_type ?? 'text',
      created_at: activityAt,
      sender_id: message.sender_id,
    } as Message,
    updated_at: activityAt,
    _sortTime: activityAt,
  };
}

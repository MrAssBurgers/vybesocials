import type { Message } from '@/hooks/useMessages';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { safeDmMembers } from '@/lib/persistedCollections';

type SortableConversation = Pick<
  LoadedDMConversation,
  'id' | 'created_at' | 'updated_at' | 'last_message' | '_sortTime' | 'members'
>;

/** Message activity only — never conversation.updated_at (bumped on view/repair). */
export function getDmConversationSortTime(conv: SortableConversation): string {
  return (
    conv.last_message?.created_at ??
    conv._sortTime ??
    conv.created_at ??
    ''
  );
}

function isPinnedForViewer(conv: SortableConversation, profileId?: string | null): boolean {
  if (!profileId) return false;
  return Boolean(
    safeDmMembers(conv.members).find((m) => m.user_id === profileId)?.is_pinned,
  );
}

/** Pinned first, then most recent message activity. Unread does not affect order. */
export function compareDmConversations(
  a: SortableConversation,
  b: SortableConversation,
  profileId?: string | null,
): number {
  const aPinned = isPinnedForViewer(a, profileId);
  const bPinned = isPinnedForViewer(b, profileId);
  if (aPinned && !bPinned) return -1;
  if (!aPinned && bPinned) return 1;
  if (aPinned && bPinned) {
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  }

  const timeA = new Date(getDmConversationSortTime(a)).getTime();
  const timeB = new Date(getDmConversationSortTime(b)).getTime();
  return timeB - timeA;
}

export function sortDmConversations<T extends SortableConversation>(
  list: T[],
  profileId?: string | null,
): T[] {
  return [...list].sort((a, b) => compareDmConversations(a, b, profileId));
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

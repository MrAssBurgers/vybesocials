import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { safeDmMembers } from '@/lib/persistedCollections';

/** True when the peer sent the latest message and viewer has not replied since. */
export function conversationNeedsReply(
  conv: LoadedDMConversation,
  profileId?: string | null,
): boolean {
  if (!profileId || conv.is_group) return false;
  const last = conv.last_message;
  if (!last?.sender_id || !last.created_at) return false;
  if (last.sender_id === profileId) return false;

  const member = safeDmMembers(conv.members).find((m) => m.user_id === profileId);
  const lastReadAt = member?.last_read_at;
  if (!lastReadAt) return true;

  return new Date(lastReadAt).getTime() < new Date(last.created_at).getTime();
}

import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { compactTime } from '@/lib/compactTime';
import { resolveOwnMessageStatus } from '@/lib/messageReadStatus';
import { safeDmMembers } from '@/lib/persistedCollections';

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Build the compact delivery line shown under each inbox name. */
export function dmInboxPreviewStatus(
  conversation: LoadedDMConversation,
  profileId?: string,
  authUid?: string,
  streakCount?: number,
): string {
  const message = conversation.last_message;
  if (!message) return streakCount ? `${streakCount} 🔥` : 'Start a conversation';

  const age = compactTime(message.created_at);
  const isOwn = message.sender_id === profileId || message.sender_id === authUid;
  let label = 'Received';

  if (isOwn) {
    const peerLastReadAt = safeDmMembers(conversation.members)
      .filter((member) => member.user_id !== profileId && member.user_id !== authUid)
      .map((member) => member.last_read_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);
    label = titleCase(
      resolveOwnMessageStatus(message, {
        peerLastReadAt,
        isGroupChat: conversation.is_group,
      }),
    );
  }

  return `${label} • ${age}${streakCount ? ` • ${streakCount} 🔥` : ''}`;
}

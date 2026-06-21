import type { MessageStatus } from '@/components/chat/SnapchatFeedback';
import type { Message } from '@/hooks/useMessages';

/** Snapchat-style status for the sender's own message bubble. */
export function resolveOwnMessageStatus(
  message: Message,
  options: {
    peerLastReadAt?: string | null;
    failed?: boolean;
    isGroupChat?: boolean;
  } = {},
): MessageStatus {
  const { peerLastReadAt, failed, isGroupChat } = options;

  if (failed) return 'sending';
  if (typeof message.id === 'string' && message.id.startsWith('temp-')) return 'sending';

  if (message.views && message.views.length > 0) return 'opened';
  if (!isGroupChat && peerLastReadAt && message.created_at && message.created_at <= peerLastReadAt) {
    return 'opened';
  }

  return 'delivered';
}

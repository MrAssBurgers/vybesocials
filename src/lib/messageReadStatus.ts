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

  const id = typeof message.id === 'string' ? message.id : '';
  const pending =
    id.startsWith('temp-') ||
    id.startsWith('vybe-') ||
    Boolean((message as { _sending?: boolean })._sending);
  if (pending) return 'delivered';

  if (message.views && message.views.length > 0) return 'opened';
  if (!isGroupChat && peerLastReadAt && message.created_at && message.created_at <= peerLastReadAt) {
    return 'opened';
  }

  return 'delivered';
}

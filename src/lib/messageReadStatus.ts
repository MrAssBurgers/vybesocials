import type { MessageStatus } from '@/components/chat/SnapchatFeedback';
import type { Message } from '@/hooks/useMessages';

function isSelfViewer(
  viewerId: string | undefined | null,
  senderIds: Set<string>,
): boolean {
  if (!viewerId) return true;
  return senderIds.has(viewerId);
}

/** Snapchat-style status for the sender's own message bubble. */
export function resolveOwnMessageStatus(
  message: Message,
  options: {
    peerLastReadAt?: string | null;
    failed?: boolean;
    isGroupChat?: boolean;
    /** Profile id and/or auth uid that belong to the sender (self). */
    senderIds?: Array<string | null | undefined>;
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

  const selfIds = new Set<string>(
    [message.sender_id, ...(options.senderIds || [])].filter(
      (value): value is string => Boolean(value),
    ),
  );

  // Opened only if a non-sender view exists — never treat self/auth dual-id views as opened.
  const hasPeerView = Boolean(
    message.views?.some((view) => !isSelfViewer(view.user_id, selfIds)),
  );
  if (hasPeerView) return 'opened';

  if (!isGroupChat && peerLastReadAt && message.created_at && message.created_at <= peerLastReadAt) {
    return 'opened';
  }

  return 'delivered';
}

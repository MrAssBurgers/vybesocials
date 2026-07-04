import type { Message } from '@/hooks/useMessages';
import { formatDmPreviewContent } from '@/lib/callChatMessages';

/** Profile ids from friend requests accepted in the last 30 days (either direction). */
export function mergeRecentNewFriendIds(
  profileId: string | undefined,
  rows: Array<{ sender_id?: string; receiver_id?: string }>,
): Set<string> {
  const ids = new Set<string>();
  if (!profileId) return ids;
  for (const row of rows) {
    if (row.sender_id && row.sender_id !== profileId) ids.add(row.sender_id);
    if (row.receiver_id && row.receiver_id !== profileId) ids.add(row.receiver_id);
  }
  return ids;
}

export function shouldShowSayHiPreview(opts: {
  lastMessage?: Message | null;
  isGroup?: boolean;
  otherProfileId?: string;
  recentNewFriendIds?: Set<string>;
}): boolean {
  if (opts.lastMessage) return false;
  if (opts.isGroup) return false;
  if (!opts.otherProfileId || !opts.recentNewFriendIds?.size) return false;
  return opts.recentNewFriendIds.has(opts.otherProfileId);
}

export function dmConversationPreviewText(opts: {
  lastMessage?: Message | null;
  isGroup?: boolean;
  profileId?: string;
  authUid?: string;
  otherProfileId?: string;
  recentNewFriendIds?: Set<string>;
  previewMaxLen?: number;
}): string {
  const { lastMessage, isGroup, profileId, authUid, otherProfileId, recentNewFriendIds, previewMaxLen = 56 } = opts;

  if (lastMessage) {
    try {
      const senderId = lastMessage.sender_id;
      const isOwn = Boolean(
        senderId &&
          ((profileId && senderId === profileId) || (authUid && senderId === authUid)),
      );
      const text = formatDmPreviewContent(lastMessage, isOwn, previewMaxLen);
      return isOwn ? `You: ${text}` : text;
    } catch {
      return lastMessage.content?.slice(0, previewMaxLen) || 'Message';
    }
  }

  if (shouldShowSayHiPreview({ lastMessage, isGroup, otherProfileId, recentNewFriendIds })) {
    return 'Say hi 👋';
  }

  if (isGroup) return 'No messages yet';
  return 'Tap to chat';
}

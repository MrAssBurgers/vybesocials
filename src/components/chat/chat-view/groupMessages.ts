/**
 * Pure grouping logic for the DM thread message list — extracted from
 * ChatView's inline `messageItems` useMemo. Groups consecutive messages by
 * sender so avatars/timestamps only render once per run, and flags sender
 * switches + media transitions so the caller can apply Instagram/iMessage-
 * style spacing.
 */
export interface GroupableMessage {
  id: string;
  sender_id: string;
  created_at: string;
  media_url?: string | null;
  media_type?: string | null;
  content?: string | null;
  reply_to_id?: string | null;
}

export interface GroupedMessageItem<M extends GroupableMessage = GroupableMessage> {
  message: M;
  isOwn: boolean;
  /** Show the sender's avatar — only on the first message of a same-sender run (never for own messages). */
  showAvatar: boolean;
  /** Show a date/time divider above this message. */
  showTimestamp: boolean;
  /** Previous message came from the same sender (tight spacing). */
  sameSender: boolean;
  /** This message and the previous one differ in "is image/gif media" status (extra spacing). */
  isMediaTransition: boolean;
  isEmojiOnly: boolean;
}

const TIMESTAMP_GAP_MS = 5 * 60 * 1000;
const EMOJI_ONLY_MAX_LEN = 8;
const EMOJI_ONLY_PATTERN = /^[\p{Emoji}\s]+$/u;

function isImageLikeMedia(message: GroupableMessage): boolean {
  return Boolean(message.media_url) && (message.media_type === 'image' || message.media_type === 'gif');
}

function isEmojiOnlyContent(message: GroupableMessage): boolean {
  if (message.media_url || typeof message.content !== 'string' || !message.content) return false;
  const trimmed = message.content.trim();
  if (!trimmed || trimmed.length > EMOJI_ONLY_MAX_LEN) return false;
  return EMOJI_ONLY_PATTERN.test(trimmed);
}

/** Resolve "is this message mine" without hardcoding the id shape callers use. */
export type OwnMessageResolver<M extends GroupableMessage> = (message: M) => boolean;

export function groupMessages<M extends GroupableMessage>(
  messages: M[],
  isOwnMessage: OwnMessageResolver<M>,
): GroupedMessageItem<M>[] {
  if (!messages.length) return [];
  return messages.map((message, index) => {
    const prevMessage = index > 0 ? messages[index - 1] : null;
    const isOwn = isOwnMessage(message);
    const showAvatar = !isOwn && (index === 0 || prevMessage?.sender_id !== message.sender_id);
    const showTimestamp =
      index === 0 ||
      new Date(message.created_at).getTime() - new Date(prevMessage?.created_at || 0).getTime() >
        TIMESTAMP_GAP_MS;
    const sameSender = Boolean(prevMessage && prevMessage.sender_id === message.sender_id);
    const isMediaTransition = Boolean(
      prevMessage && isImageLikeMedia(message) !== isImageLikeMedia(prevMessage),
    );
    const isEmojiOnly = isEmojiOnlyContent(message);

    return { message, isOwn, showAvatar, showTimestamp, sameSender, isMediaTransition, isEmojiOnly };
  });
}

/**
 * Instagram/iMessage-style vertical spacing bucket for a grouped item, given
 * the previous item in the (unfiltered) list. Same-sender runs stay tight;
 * sender switches, media transitions, and replies get more breathing room.
 */
export function spacingClassForItem(
  item: GroupedMessageItem,
  prevItem: GroupedMessageItem | null,
): string {
  const senderChanged = Boolean(prevItem && prevItem.isOwn !== item.isOwn);
  if (item.isMediaTransition || senderChanged) return 'pt-4 sm:pt-5';
  if (item.message.reply_to_id) return 'pt-3 sm:pt-3.5';
  return 'pt-1.5';
}

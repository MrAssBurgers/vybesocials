import type { Message } from '@/hooks/useMessages';

const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;

/** Restore vanish timer when a 24h message is unsaved after view. */
export function restoreExpiresAtOnUnsave(message: Message): string | null {
  if (message.view_mode !== '24h') return message.expires_at ?? null;

  const viewedAt =
    message.viewed_at ||
    message.views?.find((v) => v.user_id !== message.sender_id)?.viewed_at ||
    null;

  if (viewedAt) {
    return new Date(new Date(viewedAt).getTime() + TWENTY_FOUR_H_MS).toISOString();
  }

  return message.expires_at ?? null;
}

/** Toggle only the viewer's save flag — Snapchat-style per-user keep. */
export function applyMessageSaveToggle(message: Message, profileId: string): Message {
  const isSender = message.sender_id === profileId;
  const mySaved = isSender ? !!message.saved_by_sender : !!message.saved_by_recipient;
  const nextMySaved = !mySaved;

  const saved_by_sender = isSender ? nextMySaved : !!message.saved_by_sender;
  const saved_by_recipient = !isSender ? nextMySaved : !!message.saved_by_recipient;
  const stillSaved = saved_by_sender || saved_by_recipient;

  return {
    ...message,
    saved_by_sender,
    saved_by_recipient,
    saved_at: stillSaved ? message.saved_at || new Date().toISOString() : null,
    expires_at: nextMySaved ? null : restoreExpiresAtOnUnsave(message),
  };
}

export function isSavedByViewer(message: Message, profileId: string): boolean {
  if (message.sender_id === profileId) return !!message.saved_by_sender;
  return !!message.saved_by_recipient;
}

export function isProtectedFromExpiry(message: Message): boolean {
  return !!(message.saved_by_sender || message.saved_by_recipient);
}

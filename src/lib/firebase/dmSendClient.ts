import { invokeFunction } from './functionsService';
import type { Message } from '@/hooks/useMessages';
import type { ViewMode } from '@/hooks/useMessages';
import { classifyDmSendError } from '@/lib/dmSendErrors';

export interface SendDmPayload {
  conversationId: string;
  content?: string;
  viewMode?: ViewMode;
  replyToId?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  messageType?: string;
  /** Idempotency key (optimistic temp id / outbox id) — prevents duplicate reconnect sends. */
  clientMessageId?: string | null;
  otherProfileId?: string | null;
}

/**
 * Canonical server send — every DM insert must go through `sendDmMessage`.
 * Direct client Firestore message creates are denied by security rules.
 */
export async function sendDmViaCloudFunction(
  payload: SendDmPayload,
): Promise<{ data: Message | null; error: { message: string; code?: string } | null }> {
  const { data, error } = await invokeFunction<{ message: Message }>('send-dm-message', {
    conversationId: payload.conversationId,
    content: payload.content ?? '',
    viewMode: payload.viewMode ?? 'permanent',
    replyToId: payload.replyToId ?? null,
    mediaUrl: payload.mediaUrl ?? null,
    mediaType: payload.mediaType ?? null,
    messageType: payload.messageType,
    clientMessageId: payload.clientMessageId ?? null,
    otherProfileId: payload.otherProfileId ?? null,
  }).single();

  if (error) {
    const kind = classifyDmSendError(error);
    return {
      data: null,
      error: {
        message: error.message || 'Failed to send message',
        code: error.name || kind,
      },
    };
  }

  const message = data?.message;
  if (!message?.id) {
    return { data: null, error: { message: 'Invalid server response' } };
  }

  return {
    data: {
      ...message,
      view_mode: (message.view_mode || 'permanent') as ViewMode,
      views: message.views || [],
      reactions: message.reactions || [],
    },
    error: null,
  };
}

/** @deprecated Permission retries no longer apply — sends are callable-only. */
export function isRetryableSendError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const kind = classifyDmSendError(error);
  return kind === 'transient' || kind === 'rate_limited';
}

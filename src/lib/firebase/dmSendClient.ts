import { invokeFunction } from './functionsService';
import type { Message } from '@/hooks/useMessages';
import type { ViewMode } from '@/hooks/useMessages';

export interface SendDmPayload {
  conversationId: string;
  content?: string;
  viewMode?: ViewMode;
  replyToId?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  messageType?: string;
}

/** Server-side send fallback when Firestore client rules reject the insert. */
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
  }).single();

  if (error) {
    return {
      data: null,
      error: {
        message: error.message || 'Failed to send message',
        code: error.name,
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
      views: [],
      reactions: [],
    },
    error: null,
  };
}

export function isRetryableSendError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === 'permission-denied' ||
    /permission|could not be delivered|chat permissions|missing or insufficient/i.test(
      error.message || '',
    )
  );
}

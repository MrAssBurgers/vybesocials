/**
 * Canonical DM send path — all message inserts should go through here.
 * Optimistic UI lives in useInstantSend; this module handles server persistence.
 */
import { db } from '@/lib/firebase';
import { sendDmViaCloudFunction, isRetryableSendError } from '@/lib/firebase/dmSendClient';
import {
  inferOtherParticipantId,
  repairConversationForSend,
  resetMessagesReady,
} from '@/lib/dmMembershipRepair';
import { withTimeout } from '@/lib/withTimeout';
import type { Message, ViewMode } from '@/hooks/useMessages';

export interface DmInsertPayload {
  conversation_id: string;
  sender_id: string;
  content?: string | null;
  media_url?: string | null;
  media_type?: string | null;
  message_type?: string;
  view_mode?: ViewMode;
  expires_at?: string | null;
  reply_to_id?: string | null;
}

const MESSAGE_SELECT = `
  *,
  sender:profiles!sender_id(id, username, avatar_url, display_name)
`;

function normalizeMessage(row: Record<string, unknown>): Message {
  return {
    ...(row as Message),
    view_mode: (row.view_mode || 'permanent') as ViewMode,
    views: [],
    reactions: [],
  };
}

async function repairSender(
  conversationId: string,
  senderId: string,
  otherProfileId: string | null,
): Promise<string> {
  resetMessagesReady(conversationId, senderId);
  try {
    await withTimeout(
      repairConversationForSend(conversationId, senderId, otherProfileId, { force: true }),
      12_000,
      'Send setup timed out',
    );
  } catch (err) {
    console.warn('[dmSendCore] repair failed:', err);
  }
  return senderId;
}

/** Insert a DM row with permission retry + cloud-function fallback. */
export async function insertDmMessage(
  payload: DmInsertPayload,
  opts?: { otherProfileId?: string | null; maxAttempts?: number },
): Promise<{ data: Message | null; error: { message: string; code?: string } | null }> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  let senderId = payload.sender_id;
  const otherProfileId =
    opts?.otherProfileId ??
    inferOtherParticipantId(payload.conversation_id, senderId) ??
    null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await db
      .from('messages')
      .insert({ ...payload, sender_id: senderId })
      .select(MESSAGE_SELECT)
      .single();

    if (!result.error && result.data) {
      return { data: normalizeMessage(result.data as Record<string, unknown>), error: null };
    }

    const err = result.error;
    if (!isRetryableSendError(err) || attempt === maxAttempts - 1) {
      const cloud = await sendDmViaCloudFunction({
        conversationId: payload.conversation_id,
        content: payload.content ?? undefined,
        viewMode: (payload.view_mode as ViewMode) || 'permanent',
        replyToId: payload.reply_to_id ?? null,
        mediaUrl: payload.media_url ?? null,
        mediaType: payload.media_type ?? null,
        messageType: payload.message_type,
      });
      if (!cloud.error && cloud.data) {
        return { data: cloud.data, error: null };
      }
      return {
        data: null,
        error: {
          message: cloud.error?.message || err?.message || 'Failed to send message',
          code: err?.name,
        },
      };
    }

    senderId = await repairSender(payload.conversation_id, senderId, otherProfileId);
    await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
  }

  return { data: null, error: { message: 'Failed to send message' } };
}

export function isTransientSendError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error || '')).toLowerCase();
  return (
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    /network|failed to fetch|timeout|fetch|offline/.test(msg)
  );
}

export async function bumpConversationUpdatedAt(conversationId: string): Promise<void> {
  await db
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .then(() => {})
    .catch(() => {});
}

export function expiresAtForViewMode(viewMode: ViewMode): string | null {
  return viewMode === '24h'
    ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    : null;
}

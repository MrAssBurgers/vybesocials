/**
 * Canonical DM send path — all message inserts go through the `sendDmMessage`
 * Cloud Function. Optimistic UI lives in useInstantSend; this module handles
 * server persistence only (no direct client Firestore message creates).
 */
import { db } from '@/lib/firebase';
import { sendDmViaCloudFunction } from '@/lib/firebase/dmSendClient';
import { inferOtherParticipantId } from '@/lib/dmMembershipRepair';
import { sendMessagePush } from '@/lib/pushNotifications';
import {
  classifyDmSendError,
  dmSendFailureUserMessage,
  isTransientDmSendFailure,
} from '@/lib/dmSendErrors';
import type { Message, ViewMode } from '@/hooks/useMessages';
import { recordChallengeActivity } from '@/lib/challengeProgressClient';

const DM_SEND_LOG_KEY = 'vybe-dm-send-log';
const DM_SEND_LOG_MAX = 100;

export interface DmSendLogEntry {
  ts: number;
  op: string;
  conversationId?: string;
  tempId?: string;
  attempt?: number;
  ok?: boolean;
  error?: string;
}

/** Ring buffer of send operations — inspect via sessionStorage in devtools. */
export function logDmSend(entry: Omit<DmSendLogEntry, 'ts'>): void {
  const row: DmSendLogEntry = { ts: Date.now(), ...entry };
  console.info('[dmSend]', row);
  if (typeof sessionStorage === 'undefined') return;
  try {
    const prev = JSON.parse(sessionStorage.getItem(DM_SEND_LOG_KEY) || '[]') as DmSendLogEntry[];
    prev.unshift(row);
    sessionStorage.setItem(DM_SEND_LOG_KEY, JSON.stringify(prev.slice(0, DM_SEND_LOG_MAX)));
  } catch {
    // ignore quota errors
  }
}

export function readDmSendLog(): DmSendLogEntry[] {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    return JSON.parse(sessionStorage.getItem(DM_SEND_LOG_KEY) || '[]') as DmSendLogEntry[];
  } catch {
    return [];
  }
}

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
  /** Optimistic / outbox id for idempotent reconnect retries. */
  client_message_id?: string | null;
}

export interface DmInsertOptions {
  otherProfileId?: string | null;
  maxAttempts?: number;
  /** Server Firestore trigger is primary; client backup when device may miss trigger latency. */
  push?: {
    senderName: string;
    preview?: string;
    isGroup?: boolean;
    groupName?: string;
  };
}

function previewForPush(payload: DmInsertPayload): string {
  if (payload.content?.trim()) return payload.content.trim().slice(0, 80);
  switch (payload.media_type) {
    case 'vybe':
      return '📸 New Snap';
    case 'image':
      return '📷 Photo';
    case 'video':
      return '🎬 Video';
    case 'voice':
      return '🎤 Voice message';
    case 'gif':
      return 'GIF';
    default:
      return payload.media_url ? '📎 Media' : 'New message';
  }
}

/** Best-effort backup push — server trigger remains primary (same collapse tag dedupes). */
function firePeerPushBackup(
  payload: DmInsertPayload,
  otherProfileId: string | null,
  push?: DmInsertOptions['push'],
): void {
  if (!otherProfileId || otherProfileId === payload.sender_id || !push?.senderName) return;
  const preview = push.preview || previewForPush(payload);
  void sendMessagePush(
    otherProfileId,
    push.senderName,
    preview,
    payload.conversation_id,
    push.isGroup,
    push.groupName,
  ).catch(() => {});
}

/**
 * Persist a DM via `sendDmMessage` only.
 * Direct `messages` collection creates from the client are denied by rules.
 */
export async function insertDmMessage(
  payload: DmInsertPayload,
  opts?: DmInsertOptions,
): Promise<{ data: Message | null; error: { message: string; code?: string } | null }> {
  const otherProfileId =
    opts?.otherProfileId ??
    inferOtherParticipantId(payload.conversation_id, payload.sender_id) ??
    null;

  const maxAttempts = Math.max(1, opts?.maxAttempts ?? 2);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    logDmSend({
      op: 'callable_start',
      conversationId: payload.conversation_id,
      tempId: payload.client_message_id || undefined,
      attempt: attempt + 1,
    });

    const cloud = await sendDmViaCloudFunction({
      conversationId: payload.conversation_id,
      content: payload.content ?? undefined,
      viewMode: (payload.view_mode as ViewMode) || 'permanent',
      replyToId: payload.reply_to_id ?? null,
      mediaUrl: payload.media_url ?? null,
      mediaType: payload.media_type ?? null,
      messageType: payload.message_type,
      clientMessageId: payload.client_message_id ?? null,
      otherProfileId,
    });

    if (!cloud.error && cloud.data) {
      logDmSend({
        op: 'callable_ok',
        conversationId: payload.conversation_id,
        tempId: payload.client_message_id || undefined,
        attempt: attempt + 1,
        ok: true,
      });
      firePeerPushBackup(payload, otherProfileId, opts?.push);
      recordChallengeActivity(
        payload.sender_id,
        payload.message_type === 'vybe' ? 'snap_sent' : 'message',
      );
      return { data: cloud.data, error: null };
    }

    const kind = classifyDmSendError(cloud.error);
    const retryable = isTransientDmSendFailure(kind) && attempt < maxAttempts - 1;
    if (!retryable) {
      const message = dmSendFailureUserMessage(kind, cloud.error?.message);
      logDmSend({
        op: 'callable_failed',
        conversationId: payload.conversation_id,
        tempId: payload.client_message_id || undefined,
        ok: false,
        error: message,
      });
      return {
        data: null,
        error: {
          message,
          code: cloud.error?.code || kind,
        },
      };
    }

    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }

  return { data: null, error: { message: 'Failed to send message' } };
}

export function isTransientSendError(error: unknown): boolean {
  const kind = classifyDmSendError(
    error instanceof Error
      ? { message: error.message }
      : typeof error === 'string'
        ? error
        : { message: String(error || '') },
  );
  return isTransientDmSendFailure(kind);
}

export async function bumpConversationUpdatedAt(conversationId: string): Promise<void> {
  await db
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .then(() => {})
    .catch((err: unknown) => {
      console.warn('[DMSend] conversation updated_at bump failed:', conversationId, err);
    });
}

export function expiresAtForViewMode(_viewMode: ViewMode): string | null {
  // 24h mode: timer starts when the recipient opens the message, not at send time.
  return null;
}

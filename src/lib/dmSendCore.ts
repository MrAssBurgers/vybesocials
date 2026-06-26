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
import { sendMessagePush } from '@/lib/pushNotifications';
import type { Message, ViewMode } from '@/hooks/useMessages';

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
}

export interface DmInsertOptions {
  otherProfileId?: string | null;
  maxAttempts?: number;
  /** Fire a push to the peer when server trigger is delayed (phone locked / background). */
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

function firePeerPush(
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

const MESSAGE_SELECT = `
  *,
  sender:profiles!sender_id(id, username, avatar_url, display_name)
`;

function normalizeMessage(row: Record<string, unknown>): Message {
  return {
    ...(row as unknown as Message),
    view_mode: (row.view_mode || 'permanent') as ViewMode,
    views: [],
    reactions: [],
  };
}

async function repairSender(
  conversationId: string,
  senderId: string,
  otherProfileId: string | null,
  force = false,
): Promise<string> {
  resetMessagesReady(conversationId, senderId);
  try {
    await withTimeout(
      repairConversationForSend(conversationId, senderId, otherProfileId, { force }),
      4_000,
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
  opts?: DmInsertOptions,
): Promise<{ data: Message | null; error: { message: string; code?: string } | null }> {
  const maxAttempts = opts?.maxAttempts ?? 3;
  let senderId = payload.sender_id;
  const otherProfileId =
    opts?.otherProfileId ??
    inferOtherParticipantId(payload.conversation_id, senderId) ??
    null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    logDmSend({
      op: 'insert_start',
      conversationId: payload.conversation_id,
      attempt: attempt + 1,
    });

    const result = await db
      .from('messages')
      .insert({ ...payload, sender_id: senderId })
      .select(MESSAGE_SELECT)
      .single();

    if (!result.error && result.data) {
      logDmSend({
        op: 'insert_ok',
        conversationId: payload.conversation_id,
        attempt: attempt + 1,
        ok: true,
      });
      firePeerPush(payload, otherProfileId, opts?.push);
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
        logDmSend({
          op: 'cloud_fallback_ok',
          conversationId: payload.conversation_id,
          ok: true,
        });
        firePeerPush(payload, otherProfileId, opts?.push);
        return { data: cloud.data, error: null };
      }
      logDmSend({
        op: 'insert_failed',
        conversationId: payload.conversation_id,
        ok: false,
        error: cloud.error?.message || err?.message,
      });
      return {
        data: null,
        error: {
          message: cloud.error?.message || err?.message || 'Failed to send message',
          code: err?.name,
        },
      };
    }

    senderId = await repairSender(
      payload.conversation_id,
      senderId,
      otherProfileId,
      attempt >= 1,
    );
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
  // 24h mode: timer starts when the recipient opens the message, not at send time.
  if (viewMode === '24h') return null;
  return null;
}

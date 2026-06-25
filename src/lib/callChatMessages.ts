import { db } from '@/lib/firebase';
import { sendDmBroadcastMessage } from '@/lib/dmBroadcast';

export type CallEventKind = 'outgoing' | 'incoming' | 'ended' | 'missed' | 'declined' | 'no_answer';

export interface CallEventMeta {
  kind: CallEventKind;
  callType: 'audio' | 'video';
  durationSec?: number;
  callId?: string;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Human-readable label shown in the chat thread (Snapchat-style). */
export function formatCallEventLabel(meta: CallEventMeta, isOwn: boolean): string {
  const typeLabel = meta.callType === 'video' ? 'Video call' : 'Audio call';
  switch (meta.kind) {
    case 'outgoing':
      return isOwn ? `Outgoing ${typeLabel.toLowerCase()}` : `Incoming ${typeLabel.toLowerCase()}`;
    case 'incoming':
      return isOwn ? `Incoming ${typeLabel.toLowerCase()}` : `Incoming ${typeLabel.toLowerCase()}`;
    case 'ended':
      return meta.durationSec != null && meta.durationSec > 0
        ? `${typeLabel} · ${formatDuration(meta.durationSec)}`
        : typeLabel;
    case 'missed':
    case 'no_answer':
      return `Missed ${typeLabel.toLowerCase()}`;
    case 'declined':
      return isOwn ? `Declined ${typeLabel.toLowerCase()}` : `Missed ${typeLabel.toLowerCase()}`;
    default:
      return typeLabel;
  }
}

/** Safe preview text for conversation list / notifications (never throws). */
export function formatDmPreviewContent(
  message: {
    content?: string | null;
    message_type?: string | null;
    media_type?: string | null;
  } | null | undefined,
  isOwn: boolean,
  maxLen = 40,
): string {
  if (!message || typeof message !== 'object') return 'Say hey 👋';

  if (message.message_type === 'call_event') {
    const meta = parseCallEventMeta(asPreviewText(message.content));
    if (meta) return formatCallEventLabel(meta, isOwn);
    return message.media_type === 'video' ? 'Video call' : 'Audio call';
  }
  if (message.message_type === 'screenshot_notification') return 'Screenshot';
  if (message.message_type === 'screen_recording_notification') return 'Screen recording';

  const raw = asPreviewText(message.content);
  if (raw.startsWith('e2ee:')) return 'Chat';
  const text = raw || 'Media';
  return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
}

function asPreviewText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function parseCallEventMeta(content: string | null | undefined): CallEventMeta | null {
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as CallEventMeta;
    if (parsed?.kind && parsed?.callType) return parsed;
  } catch {
    /* legacy plain-text */
  }
  return null;
}

/** Insert a Snapchat-style call row into the DM thread + broadcast for instant delivery. */
export async function insertCallChatEvent(params: {
  conversationId: string;
  senderId: string;
  kind: CallEventKind;
  callType: 'audio' | 'video';
  durationSec?: number;
  callId?: string;
}): Promise<void> {
  const { conversationId, senderId, kind, callType, durationSec, callId } = params;
  if (!conversationId || !senderId) return;

  const meta: CallEventMeta = { kind, callType, durationSec, callId };
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const row = {
    id,
    conversation_id: conversationId,
    sender_id: senderId,
    content: JSON.stringify(meta),
    media_url: null,
    media_type: null,
    message_type: 'call_event',
    view_mode: 'permanent',
    expires_at: null,
    is_deleted: false,
    reply_to_id: null,
    created_at: now,
  };

  try {
    await db.from('messages').insert(row);
  } catch (err) {
    console.warn('[callChatMessages] insert failed:', err);
  }

  void sendDmBroadcastMessage(conversationId, {
    ...row,
    views: [],
    reactions: [],
  });
}

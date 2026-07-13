import type { LucideIcon } from 'lucide-react';
import {
  ArrowUpRight,
  Camera,
  Check,
  CheckCheck,
  Eye,
  Image as ImageIcon,
  Mic,
  PhoneMissed,
  Square,
  Video,
} from 'lucide-react';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import { compactTime } from '@/lib/compactTime';
import { resolveOwnMessageStatus } from '@/lib/messageReadStatus';
import { safeDmMembers } from '@/lib/persistedCollections';

export type DmInboxStatusKind =
  | 'start'
  | 'received'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'screenshot'
  | 'image'
  | 'video'
  | 'voice'
  | 'call'
  | 'typing';

export interface DmInboxStatusModel {
  kind: DmInboxStatusKind;
  label: string;
  /** Single compact second line: `Received · 15m · 6 🔥` */
  line: string;
  age?: string;
  Icon: LucideIcon;
  toneClass: string;
}

function isMediaMessage(message: NonNullable<LoadedDMConversation['last_message']>): boolean {
  const media = String(message.media_type || '').toLowerCase();
  const type = String(message.message_type || '').toLowerCase();
  return Boolean(
    message.media_url ||
      media.includes('image') ||
      media.includes('photo') ||
      media.includes('vybe') ||
      media.includes('video') ||
      type.includes('image') ||
      type.includes('photo') ||
      type.includes('video') ||
      type.includes('vybe'),
  );
}

function isVideoMessage(message: NonNullable<LoadedDMConversation['last_message']>): boolean {
  const media = String(message.media_type || '').toLowerCase();
  const type = String(message.message_type || '').toLowerCase();
  return media.includes('video') || type.includes('video');
}

function isVoiceMessage(message: NonNullable<LoadedDMConversation['last_message']>): boolean {
  const media = String(message.media_type || '').toLowerCase();
  const type = String(message.message_type || '').toLowerCase();
  return media.includes('audio') || media.includes('voice') || type.includes('voice');
}

function isCallMessage(message: NonNullable<LoadedDMConversation['last_message']>): boolean {
  const type = String(message.message_type || '').toLowerCase();
  const content = String(message.content || '').toLowerCase();
  return type.includes('call') || content.includes('missed') || content.includes('call');
}

function isScreenshotMessage(message: NonNullable<LoadedDMConversation['last_message']>): boolean {
  const type = String(message.message_type || '').toLowerCase();
  const content = String(message.content || '').toLowerCase();
  return type.includes('screenshot') || content.includes('screenshot');
}

function joinParts(parts: Array<string | null | undefined>): string {
  return parts.filter((p) => Boolean(p && String(p).trim())).join(' · ');
}

function truncatePreview(text: string, max = 42): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function senderFirstName(
  conversation: LoadedDMConversation,
  senderId: string,
): string | undefined {
  const member = safeDmMembers(conversation.members).find((m) => {
    if (m.user_id === senderId) return true;
    const profileId = m.profile?.id ? String(m.profile.id) : undefined;
    return profileId === senderId;
  });
  const profile = member?.profile as
    | { display_name?: string | null; username?: string | null }
    | null
    | undefined;
  const name = profile?.display_name || profile?.username;
  if (!name) return undefined;
  return String(name).split(/\s+/)[0] || undefined;
}

/** Resolve Snapchat-density status line for an inbox row. */
export function resolveDmInboxStatus(
  conversation: LoadedDMConversation,
  profileId?: string,
  authUid?: string,
  streakCount?: number,
): DmInboxStatusModel {
  const streak = streakCount && streakCount > 0 ? `${streakCount} 🔥` : undefined;
  const message = conversation.last_message;

  if (!message) {
    return {
      kind: 'start',
      label: 'Start a conversation',
      line: joinParts(['Start a conversation', streak]),
      Icon: Square,
      toneClass: 'dm-inbox-status-tone--muted',
    };
  }

  const age = compactTime(message.created_at);
  const isOwn = message.sender_id === profileId || message.sender_id === authUid;

  if (isScreenshotMessage(message)) {
    return {
      kind: 'screenshot',
      label: 'Screenshot',
      line: joinParts(['Screenshot', age, streak]),
      age,
      Icon: Camera,
      toneClass: 'dm-inbox-status-tone--danger',
    };
  }

  if (isCallMessage(message)) {
    return {
      kind: 'call',
      label: 'Missed call',
      line: joinParts(['Missed call', age, streak]),
      age,
      Icon: PhoneMissed,
      toneClass: 'dm-inbox-status-tone--call',
    };
  }

  if (isVoiceMessage(message)) {
    const label = isOwn ? 'Sent a voice note' : 'Received a voice note';
    return {
      kind: 'voice',
      label,
      line: joinParts([label, age, streak]),
      age,
      Icon: Mic,
      toneClass: 'dm-inbox-status-tone--media',
    };
  }

  if (isVideoMessage(message)) {
    const label = isOwn ? 'Sent a video' : 'Received a video';
    return {
      kind: 'video',
      label,
      line: joinParts([label, age, streak]),
      age,
      Icon: Video,
      toneClass: 'dm-inbox-status-tone--media',
    };
  }

  if (isMediaMessage(message)) {
    const label = isOwn ? 'Sent a photo' : 'Received';
    return {
      kind: 'image',
      label,
      line: joinParts([label, age, streak]),
      age,
      Icon: ImageIcon,
      toneClass: 'dm-inbox-status-tone--media',
    };
  }

  // Group chats: show latest sender + truncated text on one line.
  if (conversation.is_group && !isOwn) {
    const first = senderFirstName(conversation, message.sender_id);
    const body = truncatePreview(String(message.content || 'Message'));
    const head = first ? `${first}: ${body}` : body;
    return {
      kind: 'received',
      label: head,
      line: joinParts([head, age, streak]),
      age,
      Icon: Square,
      toneClass: 'dm-inbox-status-tone--received',
    };
  }

  if (isOwn) {
    const peerLastReadAt = safeDmMembers(conversation.members)
      .filter((member) => member.user_id !== profileId && member.user_id !== authUid)
      .map((member) => member.last_read_at)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1);
    const status = resolveOwnMessageStatus(message, {
      peerLastReadAt,
      isGroupChat: conversation.is_group,
    });
    const label =
      status === 'opened'
        ? 'Opened'
        : status === 'delivered'
          ? 'Delivered'
          : status === 'screenshot'
            ? 'Screenshot'
            : 'Sent';
    const Icon =
      status === 'opened'
        ? Eye
        : status === 'delivered'
          ? CheckCheck
          : status === 'screenshot'
            ? Camera
            : status === 'sent' || status === 'sending'
              ? Check
              : ArrowUpRight;
    const toneClass =
      status === 'opened'
        ? 'dm-inbox-status-tone--opened'
        : status === 'delivered'
          ? 'dm-inbox-status-tone--delivered'
          : 'dm-inbox-status-tone--sent';
    return {
      kind: (status === 'opened'
        ? 'opened'
        : status === 'delivered'
          ? 'delivered'
          : status === 'screenshot'
            ? 'screenshot'
            : 'sent') as DmInboxStatusKind,
      label,
      line: joinParts([label, age, streak]),
      age,
      Icon,
      toneClass,
    };
  }

  // Direct peer text — prefer short content when available, else Received.
  const text = String(message.content || '').trim();
  const label = text ? truncatePreview(text) : 'Received';
  return {
    kind: 'received',
    label: text ? 'Received' : 'Received',
    line: joinParts([label, age, streak]),
    age,
    Icon: Square,
    toneClass: 'dm-inbox-status-tone--received',
  };
}

/** Back-compat string helper used by older call sites. */
export function dmInboxPreviewStatus(
  conversation: LoadedDMConversation,
  profileId?: string,
  authUid?: string,
  streakCount?: number,
): string {
  return resolveDmInboxStatus(conversation, profileId, authUid, streakCount).line;
}

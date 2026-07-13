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
  line: string;
  age?: string;
  Icon: LucideIcon;
  toneClass: string;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
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

/** Resolve delivery / media status for an inbox row. */
export function resolveDmInboxStatus(
  conversation: LoadedDMConversation,
  profileId?: string,
  authUid?: string,
  streakCount?: number,
): DmInboxStatusModel {
  const message = conversation.last_message;
  if (!message) {
    return {
      kind: 'start',
      label: streakCount ? `${streakCount} 🔥` : 'Start a conversation',
      line: streakCount ? `${streakCount} 🔥` : 'Start a conversation',
      Icon: Square,
      toneClass: 'dm-inbox-status-tone--muted',
    };
  }

  const age = compactTime(message.created_at);
  const isOwn = message.sender_id === profileId || message.sender_id === authUid;
  const streakSuffix = streakCount ? ` • ${streakCount} 🔥` : '';

  if (isScreenshotMessage(message)) {
    return {
      kind: 'screenshot',
      label: 'Screenshot',
      line: `Screenshot taken • ${age}${streakSuffix}`,
      age,
      Icon: Camera,
      toneClass: 'dm-inbox-status-tone--danger',
    };
  }

  if (isCallMessage(message)) {
    return {
      kind: 'call',
      label: 'Call',
      line: `Missed video call • ${age}${streakSuffix}`,
      age,
      Icon: PhoneMissed,
      toneClass: 'dm-inbox-status-tone--call',
    };
  }

  if (isVoiceMessage(message)) {
    return {
      kind: 'voice',
      label: isOwn ? 'Voice' : 'Voice',
      line: `${isOwn ? 'You sent' : 'Received'} a voice note • ${age}${streakSuffix}`,
      age,
      Icon: Mic,
      toneClass: 'dm-inbox-status-tone--media',
    };
  }

  if (isVideoMessage(message)) {
    return {
      kind: 'video',
      label: 'Video',
      line: `${isOwn ? 'You sent' : 'Received'} a video • ${age}${streakSuffix}`,
      age,
      Icon: Video,
      toneClass: 'dm-inbox-status-tone--media',
    };
  }

  if (isMediaMessage(message)) {
    return {
      kind: 'image',
      label: 'Photo',
      line: `${isOwn ? 'You sent' : 'Received'} a photo • ${age}${streakSuffix}`,
      age,
      Icon: ImageIcon,
      toneClass: 'dm-inbox-status-tone--media',
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
    const label = titleCase(status === 'sending' ? 'sent' : status);
    const Icon =
      status === 'opened'
        ? Eye
        : status === 'delivered'
          ? CheckCheck
          : status === 'screenshot'
            ? Camera
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
      line: `${label} • ${age}${streakSuffix}`,
      age,
      Icon: status === 'sent' || status === 'sending' ? Check : Icon,
      toneClass,
    };
  }

  return {
    kind: 'received',
    label: 'Received',
    line: `Received • ${age}${streakSuffix}`,
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

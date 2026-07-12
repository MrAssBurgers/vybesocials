import type { ActivityType } from '@/components/chat/LiveActivityIndicator';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import type { DmInboxSectionId, DmInboxTabId } from '@/lib/dmInboxOrganize';

export type { DmInboxTabId };

export interface DMConversationPreview {
  conversation: LoadedDMConversation;
  id: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  otherProfileId?: string;
  previewText: string;
  statusLine: string;
  unreadCount: number;
  isUnread: boolean;
  isPinned: boolean;
  isMuted: boolean;
  isGroup: boolean;
  isTyping: boolean;
  presenceActivity?: ActivityType;
  streakCount?: number;
}

export type DMInboxRow =
  | { type: 'header'; id: DmInboxSectionId; label: string; count: number }
  | { type: 'conversation'; preview: DMConversationPreview };

export interface DMInboxBadges {
  unread: number;
  requests: number;
  calls: number;
}

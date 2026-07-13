import type { ActivityType } from '@/components/chat/LiveActivityIndicator';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import type { DmInboxSectionId, DmInboxTabId } from '@/lib/dmInboxOrganize';
import type { DmInboxStatusKind } from '@/lib/dmInboxStatus';
import type { MessageRequest } from '@/hooks/useMessageRequests';
import type { NearbyFriendPeer } from '@/hooks/useNearbyFriendLink';

export type { DmInboxTabId };

export type DMStoryState = 'none' | 'viewed' | 'unviewed';

export interface DMConversationPreview {
  conversation: LoadedDMConversation;
  id: string;
  conversationId: string;
  conversationType: 'direct' | 'group';
  displayName: string;
  username?: string;
  avatarUrl?: string;
  secondaryAvatarUrl?: string;
  otherProfileId?: string;
  previewText: string;
  statusLine: string;
  statusKind: DmInboxStatusKind;
  deliveryStatus: string;
  latestMessageType: string;
  latestSenderId?: string;
  latestMessageAt?: string;
  unreadCount: number;
  isUnread: boolean;
  isPinned: boolean;
  isMuted: boolean;
  isGroup: boolean;
  isTyping: boolean;
  isOnline: boolean;
  isAway: boolean;
  presenceActivity?: ActivityType;
  streakCount?: number;
  storyState: DMStoryState;
  isVerified?: boolean;
  relationshipBadge?: 'close_friend' | 'new_friend';
  quickReaction?: string;
}

export type DMInboxRow =
  | { type: 'header'; id: DmInboxSectionId; label: string; count: number }
  | { type: 'conversation'; preview: DMConversationPreview }
  | { type: 'request'; request: MessageRequest }
  | { type: 'nearby_peer'; peer: NearbyFriendPeer };

export interface DMInboxBadges {
  unread: number;
  requests: number;
  bestFriends?: number;
  nearby?: number;
}

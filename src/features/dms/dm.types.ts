import type { ActivityType } from '@/components/chat/LiveActivityIndicator';
import type { LoadedDMConversation } from '@/lib/loadDMConversations';
import type { DmInboxSectionId } from '@/lib/dmInboxOrganize';
import type { DmInboxStatusKind } from '@/lib/dmInboxStatus';
import type { MessageRequest } from '@/hooks/useMessageRequests';
import type { NearbyFriendPeer } from '@/hooks/useNearbyFriendLink';
import type { InboxRelationshipProjection } from '@/lib/relationship/relationshipTypes';

/** Smart inbox filters (Messages redesign). */
export type DmInboxFilterId =
  | 'all'
  | 'unread'
  | 'needs_reply'
  | 'groups'
  | 'pinned'
  | 'active';

/** Snapchat-style category chips (kebab-case IDs). */
export type InboxCategory =
  | 'all'
  | 'unread'
  | 'needs-reply'
  | 'nearby'
  | 'groups'
  | 'stories'
  | 'calls'
  | 'best-friends'
  | 'streaks'
  | 'active'
  | 'new';

export type InboxStreakUrgency = 'active' | 'warning' | 'expired';

export interface InboxCallSummary {
  callType: string;
  status: string;
  at: string;
}

/** @deprecated Prefer DmInboxFilterId — kept for rollback / legacy tabs. */
export type DmInboxTabId =
  | DmInboxFilterId
  | 'friends'
  | 'best_friends'
  | 'nearby'
  | 'requests';

export type DMStoryState = 'none' | 'viewed' | 'unviewed';

export type DMPresenceState = 'online' | 'away' | 'offline' | 'unknown';

/** Server-written Firestore projection document (dm_inbox_entries). */
export interface DmInboxEntryDoc {
  viewer_id: string;
  conversation_id: string;
  conversation_type: 'direct' | 'group';
  display_name: string;
  username?: string | null;
  avatar_url?: string | null;
  secondary_avatar_url?: string | null;
  other_profile_id?: string | null;
  member_ids?: string[];
  preview_text: string;
  latest_message_id?: string | null;
  latest_message_type?: string;
  latest_sender_id?: string | null;
  latest_sender_name?: string | null;
  latest_message_at?: string | null;
  delivery_status?: string;
  unread_count: number;
  mention_count?: number;
  is_unread: boolean;
  is_pinned: boolean;
  pin_order?: number;
  is_muted: boolean;
  is_archived?: boolean;
  needs_reply: boolean;
  streak_count?: number;
  relationship_badge?: 'close_friend' | 'new_friend' | null;
  primary_relationship_state?: InboxRelationshipProjection['primary_relationship_state'];
  best_friend_rank?: number | null;
  relationship_title?: string | null;
  streak_state?: InboxRelationshipProjection['streak_state'];
  birthday_state?: InboxRelationshipProjection['birthday_state'];
  favorite_state?: InboxRelationshipProjection['favorite_state'];
  relationship_updated_at?: string | null;
  is_verified?: boolean;
  search_tokens?: string[];
  updated_at?: string;
  projection_version?: number;
}

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
  latestSenderName?: string;
  latestMessageAt?: string;
  unreadCount: number;
  mentionCount: number;
  isUnread: boolean;
  isPinned: boolean;
  pinOrder: number;
  isMuted: boolean;
  isArchived: boolean;
  needsReply: boolean;
  isGroup: boolean;
  isTyping: boolean;
  typingNames: string[];
  isOnline: boolean;
  isAway: boolean;
  presenceState: DMPresenceState;
  presenceActivity?: ActivityType;
  streakCount?: number;
  storyState: DMStoryState;
  isVerified?: boolean;
  relationshipBadge?: 'close_friend' | 'new_friend';
  relationship?: InboxRelationshipProjection;
  relationshipEmoji?: string;
  streakDisplay?: string;
  quickReaction?: string;
  /** True when preview was sourced from dm_inbox_entries projection. */
  fromProjection?: boolean;
  /** Soft-filter category presentation */
  categoryMatch?: boolean;
  categoryRank?: number;
  callSummary?: InboxCallSummary;
  streakUrgency?: InboxStreakUrgency;
  showQuickReply?: boolean;
  showCallback?: boolean;
  isCategoryDimmed?: boolean;
}

export type DMInboxRow =
  | { type: 'header'; id: DmInboxSectionId; label: string; count: number }
  | { type: 'conversation'; preview: DMConversationPreview }
  | { type: 'request'; request: MessageRequest }
  | { type: 'nearby_peer'; peer: NearbyFriendPeer };

export interface DMInboxBadges {
  unread: number;
  requests: number;
  needsReply?: number;
  bestFriends?: number;
  nearby?: number;
  groups?: number;
  stories?: number;
  calls?: number;
  streaks?: number;
  active?: number;
  new?: number;
}

export interface DmInboxShadowDiff {
  missingInProjection: string[];
  missingInLegacy: string[];
  staleLatestMessage: string[];
  unreadMismatch: string[];
  orderingDiffers: boolean;
}

import type { FriendshipUiStatus } from '@/hooks/useFriends';

export type ProfileViewMode =
  | 'self'
  | 'friend'
  | 'incoming'
  | 'outgoing'
  | 'not_friends'
  | 'blocked';

export type ProfileActionId =
  | 'edit_profile'
  | 'share_profile'
  | 'profile_settings'
  | 'message'
  | 'vybe_camera'
  | 'voice_call'
  | 'video_call'
  | 'add_friend'
  | 'request_sent'
  | 'accept'
  | 'decline';

export type ProfileMenuActionId =
  | 'edit_profile'
  | 'copy_link'
  | 'share_profile'
  | 'story_settings'
  | 'privacy'
  | 'theme'
  | 'account_settings'
  | 'chat_settings'
  | 'mute'
  | 'location_sharing'
  | 'view_friendship'
  | 'create_group'
  | 'remove_friend'
  | 'block'
  | 'report'
  | 'hide_suggestion';

export interface ProfileViewCounts {
  posts: number;
  followers: number;
  following: number;
  friends: number;
}

export interface ProfileViewPermissions {
  bio: boolean;
  location: boolean;
  birthday: boolean;
  pronouns: boolean;
  posts: boolean;
  clips: boolean;
  stories: boolean;
  score: boolean;
  online: boolean;
  mutual_friends: boolean;
  friends_list: boolean;
}

export interface ProfileStoryState {
  hasStory: boolean;
  hasUnviewed: boolean;
  hasCloseFriendsStory: boolean;
}

export interface ProfileRelationshipSummary {
  emoji: string | null;
  streakDays: number;
  friendsSince: string | null;
  isBestFriend: boolean;
  mutualFriendCount: number;
}

export interface ProfileViewBadge {
  id: string;
  name: string;
  icon_url?: string | null;
}

export interface ProfileViewScore {
  score: number | null;
  visible: boolean;
}

export interface ProfileViewLevel {
  level: number | null;
  xpToNext: number | null;
}

export interface ProfileViewProfile {
  id: string;
  user_id?: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  location?: string | null;
  date_of_birth?: string | null;
  pronouns?: string | null;
  link_url?: string | null;
  interests?: string[] | null;
  is_private?: boolean | null;
  is_verified?: boolean | null;
  created_at?: string | null;
  post_count?: number;
  follower_count?: number;
  following_count?: number;
  is_following?: boolean;
}

export interface ProfileViewModel {
  profile: ProfileViewProfile | null;
  mode: ProfileViewMode;
  friendshipStatus: FriendshipUiStatus;
  permissions: ProfileViewPermissions;
  counts: ProfileViewCounts;
  primaryAction: ProfileActionId | null;
  secondaryActions: ProfileActionId[];
  menuActions: ProfileMenuActionId[];
  storyState: ProfileStoryState;
  relationshipSummary: ProfileRelationshipSummary | null;
  score: ProfileViewScore;
  level: ProfileViewLevel;
  featuredBadges: ProfileViewBadge[];
  coverThemeId: string | null;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
}

export const DEFAULT_PERMISSIONS: ProfileViewPermissions = {
  bio: true,
  location: false,
  birthday: false,
  pronouns: false,
  posts: true,
  clips: true,
  stories: true,
  score: false,
  online: false,
  mutual_friends: false,
  friends_list: false,
};

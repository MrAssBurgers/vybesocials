import type { FriendshipUiStatus } from '@/hooks/useFriends';
import type {
  ProfileActionId,
  ProfileMenuActionId,
  ProfileViewMode,
} from './types';

export function deriveProfileViewMode(opts: {
  isSelf: boolean;
  isBlocked: boolean;
  friendshipStatus: FriendshipUiStatus;
}): ProfileViewMode {
  if (opts.isSelf) return 'self';
  if (opts.isBlocked || opts.friendshipStatus === 'blocked') return 'blocked';
  if (opts.friendshipStatus === 'friends') return 'friend';
  if (opts.friendshipStatus === 'pending_received') return 'incoming';
  if (opts.friendshipStatus === 'pending_sent') return 'outgoing';
  return 'not_friends';
}

export function deriveProfileActions(mode: ProfileViewMode): {
  primary: ProfileActionId | null;
  secondary: ProfileActionId[];
} {
  switch (mode) {
    case 'self':
      return {
        primary: 'edit_profile',
        secondary: ['share_profile', 'profile_settings'],
      };
    case 'friend':
      return {
        primary: 'message',
        secondary: ['vybe_camera', 'voice_call', 'video_call'],
      };
    case 'outgoing':
      return { primary: 'request_sent', secondary: [] };
    case 'incoming':
      return { primary: 'accept', secondary: ['decline'] };
    case 'not_friends':
      return { primary: 'add_friend', secondary: [] };
    case 'blocked':
    default:
      return { primary: null, secondary: [] };
  }
}

export function deriveProfileMenuActions(mode: ProfileViewMode): ProfileMenuActionId[] {
  switch (mode) {
    case 'self':
      return [
        'edit_profile',
        'copy_link',
        'share_profile',
        'story_settings',
        'privacy',
        'theme',
        'account_settings',
      ];
    case 'friend':
      return [
        'chat_settings',
        'mute',
        'location_sharing',
        'view_friendship',
        'create_group',
        'share_profile',
        'remove_friend',
        'block',
        'report',
      ];
    case 'incoming':
    case 'outgoing':
    case 'not_friends':
      return ['share_profile', 'hide_suggestion', 'block', 'report'];
    case 'blocked':
      return ['report'];
    default:
      return [];
  }
}

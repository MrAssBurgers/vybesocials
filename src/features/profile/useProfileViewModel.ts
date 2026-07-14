import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFriendProfile } from '@/hooks/useFriendProfile';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useLockerItems } from '@/hooks/useLockerItems';
import { useVybeScore } from '@/hooks/useVybeScore';
import { useUserBadges } from '@/hooks/useBadges';
import { useStories } from '@/hooks/useStories';
import { useFriendshipPair } from '@/hooks/useFriendshipPair';
import { useStreakWithUser } from '@/hooks/useStreaks';
import { useMutualFriends } from '@/hooks/useFriendsOfFriends';
import { useCloseFriendIds } from '@/hooks/useCloseFriendIds';
import { db } from '@/lib/firebase';
import {
  deriveProfileActions,
  deriveProfileMenuActions,
  deriveProfileViewMode,
} from './profileMode';
import {
  DEFAULT_PERMISSIONS,
  type ProfileViewModel,
  type ProfileViewPermissions,
  type ProfileViewProfile,
} from './types';

async function countAcceptedFriends(subjectId: string): Promise<number> {
  const [asSender, asReceiver] = await Promise.all([
    db
      .from('friend_requests')
      .select('id')
      .eq('sender_id', subjectId)
      .eq('status', 'accepted'),
    db
      .from('friend_requests')
      .select('id')
      .eq('receiver_id', subjectId)
      .eq('status', 'accepted'),
  ]);
  const senderCount = asSender.data?.length ?? 0;
  const receiverCount = asReceiver.data?.length ?? 0;
  return senderCount + receiverCount;
}

function mapPermissions(
  visibility: Record<string, boolean> | null | undefined,
  isSelf: boolean,
  isFriend: boolean,
): ProfileViewPermissions {
  if (isSelf) {
    return {
      ...DEFAULT_PERMISSIONS,
      location: true,
      birthday: true,
      pronouns: true,
      score: true,
      online: true,
      mutual_friends: true,
      friends_list: true,
    };
  }
  const can = (key: string, fallback = true) =>
    visibility?.[key] !== false && (visibility?.[key] ?? fallback);

  return {
    bio: can('bio', true),
    location: can('location', false),
    birthday: can('birthday', false) || can('age', false),
    pronouns: can('pronouns', false),
    posts: can('posts', true),
    clips: can('clips', true),
    stories: can('stories', true),
    score: can('score', false) || can('vybe_score', false),
    online: can('activity', false) || can('online', false),
    mutual_friends: can('mutual_friends', isFriend),
    friends_list: can('friends_list', isFriend),
  };
}

/**
 * Normalized profile surface for `/u/:username`.
 * Cache key: `['profile-view', username, viewerId]`
 */
export function useProfileViewModel(username: string | undefined): ProfileViewModel {
  const viewerId = useAuthProfileId();
  const friendProfile = useFriendProfile(username);
  const profile = friendProfile.profile as ProfileViewProfile | null | undefined;
  const targetId = profile?.id;
  const isSelf = friendProfile.isSelf;
  const isFriend = friendProfile.isFriend;
  const mode = deriveProfileViewMode({
    isSelf,
    isBlocked: friendProfile.isBlocked,
    friendshipStatus: friendProfile.friendshipStatus,
  });
  const { primary, secondary } = deriveProfileActions(mode);
  const menuActions = deriveProfileMenuActions(mode);
  const permissions = mapPermissions(friendProfile.visibility, isSelf, isFriend);

  const { data: lockerData } = useLockerItems(targetId);
  const scoreQuery = useVybeScore(permissions.score || isSelf ? targetId : undefined);
  const badgesQuery = useUserBadges(targetId);
  const { data: storyGroups } = useStories();
  const pairQuery = useFriendshipPair(mode === 'friend' ? targetId : undefined);
  const streak = useStreakWithUser(mode === 'friend' ? targetId : undefined);
  const mutualsQuery = useMutualFriends(
    mode === 'friend' || permissions.mutual_friends ? targetId : undefined,
  );
  const { ids: closeFriendIds } = useCloseFriendIds();

  const levelQuery = useQuery({
    queryKey: ['profile-view-level', targetId],
    queryFn: async () => {
      if (!targetId) return null;
      const { data } = await db
        .from('user_levels')
        .select('current_level, xp, xp_to_next')
        .eq('user_id', targetId)
        .maybeSingle();
      if (data) {
        return {
          level: Number((data as { current_level?: number }).current_level ?? 1),
          xpToNext: Number((data as { xp_to_next?: number }).xp_to_next ?? 0),
        };
      }
      // Some docs key by auth uid
      const authUid = profile?.user_id;
      if (!authUid) return { level: 1, xpToNext: null };
      const { data: byAuth } = await db
        .from('user_levels')
        .select('current_level, xp, xp_to_next')
        .eq('user_id', authUid)
        .maybeSingle();
      return {
        level: Number((byAuth as { current_level?: number } | null)?.current_level ?? 1),
        xpToNext: Number((byAuth as { xp_to_next?: number } | null)?.xp_to_next ?? 0),
      };
    },
    enabled: !!targetId && (isSelf || permissions.score),
    staleTime: 60_000,
  });

  const friendsCountQuery = useQuery({
    queryKey: ['profile-view-friends-count', targetId, viewerId],
    queryFn: async () => {
      if (!targetId) return 0;
      if (!isSelf && !permissions.friends_list && mode !== 'friend') return 0;
      return countAcceptedFriends(targetId);
    },
    enabled: !!targetId && (isSelf || permissions.friends_list || mode === 'friend'),
    staleTime: 60_000,
  });

  const storyState = useMemo(() => {
    const group = (storyGroups || []).find(
      (g) => g.user.id === targetId || g.user.username === username,
    );
    return {
      hasStory: !!group?.stories?.length,
      hasUnviewed: !!group?.hasUnviewed,
      hasCloseFriendsStory: false,
    };
  }, [storyGroups, targetId, username]);

  const featuredBadges = useMemo(() => {
    const rows = (badgesQuery.data || []).slice(0, 3);
    return rows.map(
      (b: {
        id?: string;
        badge_id?: string;
        name?: string;
        badge?: { name?: string; icon?: string; icon_url?: string };
        icon_url?: string;
      }) => ({
        id: String(b.id || b.badge_id || ''),
        name: b.name || b.badge?.name || 'Badge',
        icon_url: b.icon_url || b.badge?.icon_url || b.badge?.icon || null,
      }),
    );
  }, [badgesQuery.data]);

  const relationshipSummary = useMemo(() => {
    if (mode !== 'friend' || !targetId) return null;
    return {
      emoji: '🤝',
      streakDays: Number(streak?.streak_count ?? pairQuery.data?.current_streak ?? 0),
      friendsSince: pairQuery.data?.friends_since ?? null,
      isBestFriend: closeFriendIds.has(targetId),
      mutualFriendCount: mutualsQuery.data?.length ?? 0,
    };
  }, [mode, targetId, streak, pairQuery.data, closeFriendIds, mutualsQuery.data]);

  return {
    profile: profile ?? null,
    mode,
    friendshipStatus: friendProfile.friendshipStatus,
    permissions,
    counts: {
      posts: Number(profile?.post_count ?? 0),
      followers: Number(profile?.follower_count ?? 0),
      following: Number(profile?.following_count ?? 0),
      friends: friendsCountQuery.data ?? 0,
    },
    primaryAction: primary,
    secondaryActions: secondary,
    menuActions,
    storyState,
    relationshipSummary,
    score: {
      score: permissions.score || isSelf ? (scoreQuery.data ?? null) : null,
      visible: isSelf || permissions.score,
    },
    level: {
      level: levelQuery.data?.level ?? null,
      xpToNext: levelQuery.data?.xpToNext ?? null,
    },
    featuredBadges,
    coverThemeId: lockerData?.equippedProfileTheme ?? null,
    isPending:
      friendProfile.profilePending ||
      friendProfile.relationshipPending ||
      friendProfile.visibilityPending,
    isError: friendProfile.profileError,
    refetch: () => {
      void friendProfile.refetchProfile();
    },
  };
}

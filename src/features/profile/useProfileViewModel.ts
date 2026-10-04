import { useFriendProfile } from '@/hooks/useFriendProfile';
import { getDocumentFromServer } from '@/lib/firebase/firestoreDb';
import { db } from '@/lib/firebase';
import { useProfileSectionQuery } from './hooks/useProfileSectionQuery';
import { deriveProfileActions, deriveProfileMenuActions, deriveProfileViewMode } from './profileMode';
import { DEFAULT_PERMISSIONS, type ProfileViewModel, type ProfileViewPermissions } from './types';

export function mapProfilePermissions(visibility: Record<string, boolean> | null | undefined, isSelf: boolean): ProfileViewPermissions {
  if (!visibility) return { ...DEFAULT_PERMISSIONS };
  const can = (field: string) => visibility[field] === true;
  return { bio: can('bio'), followers: can('followers'), following: can('following'), level: can('level'),
    location: can('location'), posts: can('posts'), clips: can('clips'), stories: can('stories'),
    online: can('activity'), mutual_friends: can('mutual_friends'),
    // These sections have no non-owner field in the visibility contract.
    birthday: isSelf, pronouns: isSelf, score: isSelf && can('level'), friends_list: isSelf };
}

export function useProfileViewModel(username: string | undefined): ProfileViewModel {
  const friend = useFriendProfile(username);
  const profile = friend.profile;
  const targetId = profile?.id;
  const mode = deriveProfileViewMode({ isSelf: friend.isSelf, isBlocked: friend.isBlocked, friendshipStatus: friend.friendshipStatus });
  const permissions = mapProfilePermissions(friend.visibility, friend.isSelf);
  const { primary, secondary } = deriveProfileActions(mode);
  const active = !!targetId && mode !== 'blocked';
  const count = async (table: string, field: string) => {
    const result = await db.from(table).select('id', { count: 'exact', head: true }).eq(field, targetId!);
    if (result.error) throw result.error;
    return typeof result.count === 'number' ? result.count : null;
  };
  const posts = useProfileSectionQuery(['count', targetId, 'posts'], active && permissions.posts && permissions.clips, () => count('posts', 'author_id'));
  const followers = useProfileSectionQuery(['count', targetId, 'followers'], active && permissions.followers, () => count('follows', 'following_id'));
  const following = useProfileSectionQuery(['count', targetId, 'following'], active && permissions.following, () => count('follows', 'follower_id'));
  const friends = useProfileSectionQuery(['count', targetId, 'friends'], active && permissions.friends_list, async () => {
    const results = await Promise.all(['sender_id', 'receiver_id'].map(field => db.from('friend_requests').select('id', { count: 'exact', head: true }).eq(field, targetId!).eq('status', 'accepted')));
    if (results.some(result => result.error)) throw new Error('Friend count is unavailable.');
    return results.reduce((sum, result) => sum + (result.count || 0), 0);
  });
  const level = useProfileSectionQuery(['level', targetId], active && permissions.level, async guard => {
    const first = await getDocumentFromServer('user_levels', profile?.user_id || targetId!); guard();
    if (first) return first;
    const result = await db.from('user_levels').select('current_level, xp_to_next').eq('user_id', targetId!).limit(1); guard();
    if (result.error) throw result.error;
    return result.data?.[0] || null;
  });
  const score = useProfileSectionQuery(['score', targetId], active && permissions.score, () => getDocumentFromServer('vybe_scores', targetId!));
  const badges = useProfileSectionQuery(['badges', targetId], active && friend.isSelf, async () => {
    const result = await db.rpc('get_user_badges_by_profile', { p_profile_id: targetId });
    if (result.error) throw result.error;
    return (result.data || []).map(row => ({ id: String(row.id || row.badge_id || ''), name: String(row.badge_name || 'Badge'), icon_url: typeof row.badge_icon === 'string' ? row.badge_icon : null }));
  });
  const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
  return {
    profile: profile || null, mode, friendshipStatus: friend.friendshipStatus, permissions,
    counts: { posts: posts.data ?? null, followers: followers.data ?? null, following: following.data ?? null, friends: friends.data ?? null },
    primaryAction: primary, secondaryActions: secondary,
    menuActions: deriveProfileMenuActions(mode).filter(action => action !== 'view_friendship' && action !== 'location_sharing'),
    storyState: { hasStory: false, hasUnviewed: false, hasCloseFriendsStory: false }, relationshipSummary: null,
    score: { score: number(score.data?.total_score ?? score.data?.score), visible: permissions.score },
    level: { level: number(level.data?.current_level), xpToNext: number(level.data?.xp_to_next) },
    featuredBadges: badges.data?.slice(0, 3) || [], coverThemeId: profile?.equipped_profile_theme || null,
    isPending: friend.profilePending || friend.visibilityPending,
    isError: friend.profileError || friend.visibilityError,
    refetch: () => { void friend.refetchProfile(); },
  };
}

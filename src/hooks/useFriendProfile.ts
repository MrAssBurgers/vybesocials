import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ensureFriendRequestNotice } from '@/lib/friendRequestNotice';
import { useProfileAccount } from './useProfileAccount';
import { resolveProfileVisibility } from '@/lib/friendProfileClient';
import { invokeFunction } from '@/lib/firebase/functionsService';
import { getDocumentFromServer, getDocumentsFromServer, where, firestoreLimit } from '@/lib/firebase/firestoreDb';
import { chooseProfileIdentity, profileUsernameCandidates } from '@/lib/profileUsername';
import type { ProfileViewProfile } from '@/features/profile/types';
import type { FriendshipUiStatus } from './useFriends';

function friendshipUiStatus(state: string): FriendshipUiStatus {
  if (state === 'accepted') return 'friends';
  if (state === 'pending_outgoing') return 'pending_sent';
  if (state === 'pending_incoming') return 'pending_received';
  if (state === 'blocked') return 'blocked';
  return 'none';
}

function profileRow(row: Record<string, unknown>): ProfileViewProfile {
  if ((typeof row.user_id !== 'string' || !row.user_id) && typeof row.id === 'string' && row.id && !row.id.includes('/')) {
    row = { ...row, user_id: row.id };
  }
  if (typeof row.id !== 'string' || !row.id || row.id.includes('/') || typeof row.user_id !== 'string' || !row.user_id
    || typeof row.username !== 'string' || !row.username) throw new Error('This profile could not be identified.');
  const text = (key: string) => typeof row[key] === 'string' ? row[key] as string : null;
  return { id: row.id, user_id: row.user_id, username: row.username, display_name: text('display_name'), avatar_url: text('avatar_url'),
    bio: text('bio'), location: text('location'), date_of_birth: text('date_of_birth'), pronouns: text('pronouns'), link_url: text('link_url'),
    created_at: text('created_at'), equipped_profile_theme: text('equipped_profile_theme'), is_private: row.is_private === true, is_verified: row.is_verified === true };
}

/** This route never warms private section queries from the global profile cache. */
export function useFriendProfile(username: string | undefined) {
  const actor = useProfileAccount();
  const profileId = actor.ready ? actor.profile!.id : undefined;
  const key = [profileId, actor.session.uid, actor.session.epoch];
  const profileQuery = useQuery({
    queryKey: ['profile-view-identity', username, ...key],
    queryFn: async () => {
      actor.guard();
      const name = username?.trim();
      if (!name || name.includes('/')) return null;
      for (const candidate of profileUsernameCandidates(name)) {
        const rows = await getDocumentsFromServer('profiles', [where('username', '==', candidate), firestoreLimit(8)]);
        actor.guard();
        const chosen = chooseProfileIdentity(rows, undefined, 'This profile could not be identified.');
        if (chosen) return profileRow(chosen);
      }
      // Older links can contain the canonical profile ID or Auth UID.
      const direct = await getDocumentFromServer('profiles', name); actor.guard();
      if (direct && typeof direct.username === 'string') return profileRow(direct);
      const aliases = await getDocumentsFromServer('profiles', [where('user_id', '==', name), firestoreLimit(2)]); actor.guard();
      if (aliases.length > 1) throw new Error('This profile could not be identified.');
      return aliases[0] ? profileRow(aliases[0]) : null;
    },
    enabled: actor.ready && !!username, retry: false, staleTime: 0, gcTime: 0, refetchOnMount: 'always', networkMode: 'always',
  });
  const targetId = profileQuery.isFetchedAfterMount && !profileQuery.isError ? profileQuery.data?.id : undefined;
  const visibilityQuery = useQuery({
    queryKey: ['profile-visibility-resolved', targetId, ...key],
    queryFn: () => resolveProfileVisibility({ targetId: targetId!, expectedOwnerUid: actor.user!.id, expectedProfileId: profileId! }, actor.guard),
    enabled: actor.ready && !!targetId, retry: false, staleTime: 0, gcTime: 0, networkMode: 'always',
    refetchOnMount: 'always', refetchOnWindowFocus: 'always', refetchOnReconnect: 'always', refetchInterval: 15_000,
  });
  const permitted = actor.ready && !!targetId && visibilityQuery.isFetchedAfterMount && !visibilityQuery.isError;
  const resolved = permitted ? visibilityQuery.data : undefined;
  const requests = useQuery({
    queryKey: ['profile-view-request', targetId, ...key],
    queryFn: async (): Promise<FriendshipUiStatus> => {
      actor.guard();
      // The profile button used to read friend_requests directly. That query
      // fails closed (missing composite index or a rules rejection) and the
      // failure was shown as "Add Friend" even after getFriendshipState had
      // already confirmed a pending request.
      const result = await invokeFunction<{ state?: string }>('get-friendship-state', { target_profile_id: targetId }).single();
      actor.guard();
      const state = !result.error && typeof result.data?.state === 'string' ? result.data.state : '';
      if (state === 'pending_outgoing' || state === 'pending_incoming' || state === 'accepted' || state === 'blocked') {
        if (state === 'pending_outgoing' && profileId && targetId) {
          void ensureFriendRequestNotice(targetId, profileId);
        }
        return friendshipUiStatus(state);
      }
      let fallback: FriendshipUiStatus = 'none';
      try {
        const [sent, received] = await Promise.all([
          getDocumentsFromServer('friend_requests', [where('sender_id', '==', profileId), where('receiver_id', '==', targetId), where('status', '==', 'pending'), firestoreLimit(1)]),
          getDocumentsFromServer('friend_requests', [where('sender_id', '==', targetId), where('receiver_id', '==', profileId), where('status', '==', 'pending'), firestoreLimit(1)]),
        ]);
        actor.guard();
        if (received.length) fallback = 'pending_received';
        else if (sent.length) fallback = 'pending_sent';
      } catch (error) {
        if (!state) throw error;
      }
      if (fallback !== 'none') return fallback;
      if (state === 'none' || state === 'declined' || state === 'cancelled') return 'none';
      if (result.error) throw new Error(result.error.message || 'Friendship could not be checked.');
      return 'none';
    },
    enabled: !!resolved && !resolved.isSelf && !resolved.isBlocked && !resolved.isFriend,
    retry: false, gcTime: 0, staleTime: 0,
  });
  useEffect(() => {
    if (!actor.ready || !targetId) return;
    const resume = () => { try { actor.guard(); void visibilityQuery.refetch(); } catch { /* Old account. */ } };
    window.addEventListener('app-resumed', resume);
    return () => window.removeEventListener('app-resumed', resume);
  }, [actor.ready, actor.session.uid, actor.session.epoch, targetId, visibilityQuery.refetch]);
  const status: FriendshipUiStatus = resolved?.isBlocked ? 'blocked' : resolved?.isFriend ? 'friends' : !requests.isError ? requests.data || 'none' : 'none';
  return {
    actor, profile: resolved ? profileQuery.data : null,
    profilePending: actor.ready && (profileQuery.isLoading || !profileQuery.isFetchedAfterMount),
    profileError: !actor.ready || profileQuery.isError,
    refetchProfile: async () => { await profileQuery.refetch(); await visibilityQuery.refetch(); await requests.refetch(); },
    friendshipStatus: status, isFriend: resolved?.isFriend === true,
    isPendingRequest: status === 'pending_sent' || status === 'pending_received',
    isSelf: resolved?.isSelf === true, isBlocked: resolved?.isBlocked === true,
    profileIdReady: actor.ready, relationshipPending: false, relationshipError: requests.isError,
    visibility: resolved?.fields,
    visibilityPending: actor.ready && !!targetId && !visibilityQuery.isError && (!visibilityQuery.isFetchedAfterMount || visibilityQuery.isLoading),
    visibilityError: visibilityQuery.isError,
  };
}

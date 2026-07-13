import {
  useQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { getEffectiveProfileId } from '@/lib/profileCache';
import { invalidateConversationCaches } from '@/lib/invalidateConversationCaches';
import { normalizeToProfileId } from '@/lib/dmMembershipRepair';
import { createDmChat } from '@/lib/firebase/chats';
import { firebaseAuth } from '@/lib/firebase/authService';
import { resolveSessionProfileId } from '@/lib/resolveSessionProfileId';
import { syncUserAuthIndex } from '@/lib/firebase/profileResolve';
import { toast } from 'sonner';
import { recordChallengeActivity } from '@/lib/challengeProgressClient';
import { ensureArray } from '@/lib/persistedCollections';

/** Stable doc id — matches directed pair (sender → receiver). */
function friendRequestDocId(senderId: string, receiverId: string): string {
  return `${senderId}_${receiverId}`;
}

export type FriendshipState =
  | 'none'
  | 'pending_outgoing'
  | 'pending_incoming'
  | 'accepted'
  | 'declined'
  | 'cancelled'
  | 'blocked';

export type FriendshipUiStatus =
  | 'none'
  | 'pending_sent'
  | 'pending_received'
  | 'friends'
  | 'blocked';

export interface FriendshipStatusResult {
  state: FriendshipState;
  status: FriendshipUiStatus;
  requestId: string | null;
}

export function normalizeFriendshipState(
  storedStatus: unknown,
  direction: 'outgoing' | 'incoming',
): FriendshipState {
  if (storedStatus === 'accepted') return 'accepted';
  if (storedStatus === 'pending') {
    return direction === 'outgoing' ? 'pending_outgoing' : 'pending_incoming';
  }
  if (storedStatus === 'declined') return 'declined';
  if (storedStatus === 'cancelled') return 'cancelled';
  if (storedStatus === 'blocked') return 'blocked';
  return 'none';
}

export function friendshipUiStatus(state: FriendshipState): FriendshipUiStatus {
  if (state === 'accepted') return 'friends';
  if (state === 'pending_outgoing') return 'pending_sent';
  if (state === 'pending_incoming') return 'pending_received';
  if (state === 'blocked') return 'blocked';
  return 'none';
}

function friendshipResult(
  state: FriendshipState,
  requestId: string | null = null,
): FriendshipStatusResult {
  return {
    state,
    status: friendshipUiStatus(state),
    requestId: state === 'declined' || state === 'cancelled' ? null : requestId,
  };
}

type FriendshipMutationResponse = {
  ok?: boolean;
  state?: FriendshipState;
  request_id?: string | null;
  already_exists?: boolean;
};

async function invokeFriendshipMutation(payload: Record<string, unknown>) {
  const { data, error } = await db.functions.invoke<FriendshipMutationResponse>(
    'mutate-friendship',
    payload,
  );
  if (error) throw error;
  if (!data?.ok) throw new Error('Friendship update failed');
  return data;
}

type QuerySnapshot = Array<[QueryKey, unknown]>;

function snapshotFriendshipCaches(queryClient: QueryClient): QuerySnapshot {
  return [
    ...queryClient.getQueriesData({ queryKey: ['friend-requests'] }),
    ...queryClient.getQueriesData({ queryKey: ['friendship-status'] }),
    ...queryClient.getQueriesData({ queryKey: ['friends'] }),
    ...queryClient.getQueriesData({ queryKey: ['recently-accepted-friends'] }),
  ];
}

function restoreFriendshipCaches(queryClient: QueryClient, snapshot?: QuerySnapshot) {
  snapshot?.forEach(([key, value]) => queryClient.setQueryData(key, value));
}

function setCachedFriendshipStatus(
  queryClient: QueryClient,
  profileId: string,
  targetId: string,
  result: FriendshipStatusResult,
) {
  queryClient.setQueriesData(
    {
      predicate: (query) =>
        query.queryKey[0] === 'friendship-status' &&
        query.queryKey[1] === profileId &&
        query.queryKey[2] === targetId,
    },
    result,
  );
}

async function resolveActorProfileId(liveProfileId?: string | null): Promise<string> {
  const resolved = await resolveSessionProfileId(liveProfileId);
  const profileId = resolved || getEffectiveProfileId(liveProfileId);
  if (!profileId) throw new Error('Profile still loading — try again in a moment');

  const { data: { user } } = await firebaseAuth.getUser();
  if (user?.id) {
    await syncUserAuthIndex(user.id, profileId);
  }
  return profileId;
}

export interface FriendRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
  sender?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
  receiver?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

export function useFriendRequests() {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  // Real-time subscription for friend requests
  useEffect(() => {
    if (!profileId) return;

    const channel = subscribePostgresChannel(`friend-requests:${profileId}`, [
      {
        event: '*',
        table: 'friend_requests',
        filter: `receiver_id=eq.${profileId}`,
        callback: async (payload) => {
          const row = payload.new as { status?: string; sender_id?: string };
          if (payload.eventType === 'INSERT' && row.status === 'pending') {
            const { data: sender } = await db
              .from('profiles')
              .select('username, display_name, avatar_url')
              .eq('id', row.sender_id)
              .single();
            const name = sender?.display_name || sender?.username || 'Someone';
            toast.success(`${name} sent you a friend request! 👋`, { duration: 5000 });
          }
          queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
          queryClient.invalidateQueries({ queryKey: ['friendship-status'] });
          queryClient.invalidateQueries({ queryKey: ['friends'] });
        },
      },
      {
        event: '*',
        table: 'friend_requests',
        filter: `sender_id=eq.${profileId}`,
        callback: (payload) => {
          const status = (payload.new as any).status;
          if (payload.eventType === 'UPDATE' && status === 'accepted') {
            toast.success('Your friend request was accepted! 🎉');
          }
          queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
          queryClient.invalidateQueries({ queryKey: ['friends'] });
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [profileId, queryClient]);

  return useQuery({
    queryKey: ['friend-requests', profileId],
    queryFn: async () => {
      if (!profileId) return { incoming: [], outgoing: [] };

      const { data: incomingRaw, error: inError } = await db
        .from('friend_requests')
        .select(`
          *,
          sender:profiles!sender_id(id, user_id, username, avatar_url, display_name)
        `)
        .eq('receiver_id', profileId)
        .eq('status', 'pending');

      if (inError) throw inError;

      const { data: outgoingRaw, error: outError } = await db
        .from('friend_requests')
        .select(`
          *,
          receiver:profiles!receiver_id(id, user_id, username, avatar_url, display_name)
        `)
        .eq('sender_id', profileId)
        .eq('status', 'pending');

      if (outError) throw outError;

      const sortByCreatedDesc = <T extends { created_at?: string }>(rows: T[]) =>
        [...rows].sort(
          (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
        );

      return {
        incoming: sortByCreatedDesc(incomingRaw || []) as FriendRequest[],
        outgoing: sortByCreatedDesc(outgoingRaw || []) as FriendRequest[],
      };
    },
    enabled: !!profileId,
    staleTime: 30000, // Reduced to 30 seconds with realtime
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    networkMode: 'always',
  });
}

export function useFriends() {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profileId) return;
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['friends', profileId] });
      queryClient.invalidateQueries({ queryKey: ['recently-accepted-friends', profileId] });
    };
    const channel = subscribePostgresChannel(`friends:${profileId}`, [
      { event: '*', table: 'friend_requests', filter: `sender_id=eq.${profileId}`, callback: invalidate },
      { event: '*', table: 'friend_requests', filter: `receiver_id=eq.${profileId}`, callback: invalidate },
    ]);
    return () => removeRealtimeChannel(channel);
  }, [profileId, queryClient]);

  const query = useQuery({
    queryKey: ['friends', profileId],
    queryFn: async () => {
      if (!profileId) return [];

      // Get accepted friend requests where user is sender or receiver
      const { data: asSender, error: senderError } = await db
        .from('friend_requests')
        .select(`
          receiver:profiles!receiver_id(id, user_id, username, avatar_url, display_name)
        `)
        .eq('sender_id', profileId)
        .eq('status', 'accepted');

      if (senderError) throw senderError;

      const { data: asReceiver, error: receiverError } = await db
        .from('friend_requests')
        .select(`
          sender:profiles!sender_id(id, user_id, username, avatar_url, display_name)
        `)
        .eq('receiver_id', profileId)
        .eq('status', 'accepted');

      if (receiverError) throw receiverError;

      const friends = [
        ...(asSender || []).map((r) => r.receiver),
        ...(asReceiver || []).map((r) => r.sender),
      ].filter((f): f is NonNullable<typeof f> => Boolean(f?.id));

      // Dedupe by profile id (same person can appear in both directions / split profiles).
      const byId = new Map<string, (typeof friends)[number]>();
      const byUsername = new Map<string, string>();
      for (const friend of friends) {
        const id = String(friend.id);
        const uname = String(friend.username || '').toLowerCase();
        if (uname && byUsername.has(uname)) {
          const existingId = byUsername.get(uname)!;
          // Prefer non-auth-looking usernames already kept; keep first
          if (byId.has(existingId)) continue;
        }
        if (byId.has(id)) continue;
        byId.set(id, friend);
        if (uname) byUsername.set(uname, id);
      }

      return Array.from(byId.values());
    },
    enabled: !!profileId,
    staleTime: 2 * 60 * 1000, // 2 minutes cache
    gcTime: 1000 * 60 * 60 * 24 * 14, // 14 days — keep friends available offline for DMs
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: (prev) => prev,
    networkMode: 'offlineFirst',
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    select: (data) => ensureArray(data),
  });

  return {
    ...query,
    data: ensureArray(query.data),
  };
}

export interface RecentlyAcceptedFriend {
  id: string;
  username: string;
  avatar_url: string | null;
  display_name: string | null;
  accepted_at: string;
}

/** Friends whose request flipped to "accepted" recently — for the Add Friends → Requests tab. */
export function useRecentlyAcceptedFriends(limit = 15) {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['recently-accepted-friends', profileId, limit],
    queryFn: async (): Promise<RecentlyAcceptedFriend[]> => {
      if (!profileId) return [];

      const [asSenderRes, asReceiverRes] = await Promise.all([
        db
          .from('friend_requests')
          .select('updated_at, created_at, receiver:profiles!receiver_id(id, username, avatar_url, display_name)')
          .eq('sender_id', profileId)
          .eq('status', 'accepted'),
        db
          .from('friend_requests')
          .select('updated_at, created_at, sender:profiles!sender_id(id, username, avatar_url, display_name)')
          .eq('receiver_id', profileId)
          .eq('status', 'accepted'),
      ]);

      if (asSenderRes.error) throw asSenderRes.error;
      if (asReceiverRes.error) throw asReceiverRes.error;

      const merged = [
        ...(asSenderRes.data || []).map((r: any) => ({ ...r.receiver, accepted_at: r.updated_at || r.created_at })),
        ...(asReceiverRes.data || []).map((r: any) => ({ ...r.sender, accepted_at: r.updated_at || r.created_at })),
      ].filter((f) => f?.id);

      const byId = new Map<string, (typeof merged)[number]>();
      const byUsername = new Map<string, string>();
      for (const friend of merged) {
        const id = String(friend.id);
        const uname = String(friend.username || '').toLowerCase();
        if (uname && byUsername.has(uname) && byId.has(byUsername.get(uname)!)) continue;
        if (byId.has(id)) continue;
        byId.set(id, friend);
        if (uname) byUsername.set(uname, id);
      }

      return Array.from(byId.values())
        .sort((a, b) => new Date(b.accepted_at || 0).getTime() - new Date(a.accepted_at || 0).getTime())
        .slice(0, limit) as RecentlyAcceptedFriend[];
    },
    enabled: !!profileId,
    staleTime: 60000,
    select: (data) => ensureArray(data),
  });
}

export function useFriendshipStatus(targetUserId: string | undefined) {
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profileId || !targetUserId || profileId === targetUserId) return;
    const invalidate = () => {
      queryClient.invalidateQueries({
        queryKey: ['friendship-status', profileId, targetUserId],
      });
      queryClient.invalidateQueries({ queryKey: ['friend-requests', profileId] });
      queryClient.invalidateQueries({ queryKey: ['friends', profileId] });
    };
    const channel = subscribePostgresChannel(
      `friendship-status:${profileId}:${targetUserId}`,
      [
        {
          event: '*',
          table: 'friend_requests',
          filter: `sender_id=eq.${profileId}`,
          callback: (payload) => {
            const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as FriendRequest;
            if (row.receiver_id === targetUserId) invalidate();
          },
        },
        {
          event: '*',
          table: 'friend_requests',
          filter: `receiver_id=eq.${profileId}`,
          callback: (payload) => {
            const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as FriendRequest;
            if (row.sender_id === targetUserId) invalidate();
          },
        },
      ],
    );
    return () => removeRealtimeChannel(channel);
  }, [profileId, queryClient, targetUserId]);

  return useQuery({
    queryKey: ['friendship-status', profileId, targetUserId],
    queryFn: async (): Promise<FriendshipStatusResult> => {
      if (!profileId || !targetUserId || profileId === targetUserId) {
        return friendshipResult('none');
      }

      const targetProfileId = (await normalizeToProfileId(targetUserId)) || targetUserId;
      if (profileId === targetProfileId) {
        return friendshipResult('none');
      }

      const { data, error } = await db.functions.invoke<{
        state?: FriendshipState;
        request_id?: string | null;
      }>('get-friendship-state', { target_profile_id: targetProfileId });
      if (error) throw error;
      const state = data?.state;
      if (!state || ![
        'none',
        'pending_outgoing',
        'pending_incoming',
        'accepted',
        'declined',
        'cancelled',
        'blocked',
      ].includes(state)) {
        return friendshipResult('none');
      }
      return friendshipResult(state, data?.request_id || null);
    },
    enabled: !!profileId && !!targetUserId,
    staleTime: 30000,
    placeholderData: (prev) => prev,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

export function useSendFriendRequest() {
  const { profile } = useAuth();
  const liveProfileId = useAuthProfileId();
  const queryClient = useQueryClient();

  const ensureDirectConversation = async (currentUserId: string, receiverId: string) => {
    try {
      await createDmChat(receiverId);
      return true;
    } catch (error) {
      console.error('[Friends] Failed to create DM conversation:', error);
      return false;
    }
  };

  return useMutation({
    mutationFn: async (receiverId: string) => {
      const profileId = await resolveActorProfileId(profile?.id);
      const receiverProfileId = (await normalizeToProfileId(receiverId)) || receiverId;
      if (receiverProfileId === profileId) {
        throw new Error('Cannot send a friend request to yourself');
      }
      const result = await invokeFriendshipMutation({
        action: 'send',
        target_profile_id: receiverProfileId,
      });
      const conversationCreated = await ensureDirectConversation(profileId, receiverProfileId);
      return {
        alreadyExists: !!result.already_exists,
        conversationCreated,
        receiverProfileId,
      };
    },
    onMutate: async (receiverId: string) => {
      const profileId = liveProfileId || profile?.id;
      if (!profileId) return { snapshot: snapshotFriendshipCaches(queryClient) };
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['friend-requests'] }),
        queryClient.cancelQueries({ queryKey: ['friendship-status'] }),
      ]);
      const snapshot = snapshotFriendshipCaches(queryClient);
      setCachedFriendshipStatus(
        queryClient,
        profileId,
        receiverId,
        friendshipResult('pending_outgoing', friendRequestDocId(profileId, receiverId)),
      );
      return { snapshot };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      queryClient.invalidateQueries({ queryKey: ['friendship-status'] });
      invalidateConversationCaches(queryClient);

      if (result?.alreadyExists) return;

      toast.success(result?.conversationCreated ? 'Friend request sent! Chat created.' : 'Friend request sent!');
    },
    onError: (error: any, _receiverId, context) => {
      restoreFriendshipCaches(queryClient, context?.snapshot);
      if (error?.message?.includes('already')) return;
      const msg = error instanceof Error ? error.message : String(error?.message || '');
      toast.error(
        /loading|not found|permission|blocked|yourself/i.test(msg)
          ? msg
          : 'Failed to send friend request',
      );
    },
  });
}

export function useRespondToFriendRequest() {
  const { profile } = useAuth();
  const liveProfileId = useAuthProfileId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      action
    }: {
      requestId: string;
      action: 'accept' | 'decline';
    }) => {
      await resolveActorProfileId(profile?.id);
      return invokeFriendshipMutation({ action, request_id: requestId });
    },
    onMutate: async (variables) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['friend-requests'] }),
        queryClient.cancelQueries({ queryKey: ['friendship-status'] }),
        queryClient.cancelQueries({ queryKey: ['friends'] }),
      ]);
      const snapshot = snapshotFriendshipCaches(queryClient);
      let request: FriendRequest | undefined;
      queryClient.setQueriesData(
        { queryKey: ['friend-requests'] },
        (current: any) => {
          if (!current) return current;
          const all = [...ensureArray(current.incoming), ...ensureArray(current.outgoing)] as FriendRequest[];
          request ||= all.find((row) => row.id === variables.requestId);
          return {
            ...current,
            incoming: ensureArray(current.incoming).filter((row: FriendRequest) => row.id !== variables.requestId),
            outgoing: ensureArray(current.outgoing).filter((row: FriendRequest) => row.id !== variables.requestId),
          };
        },
      );
      const profileId = liveProfileId || profile?.id;
      const targetId = request?.sender_id;
      if (profileId && targetId) {
        const state = variables.action === 'accept' ? 'accepted' : 'declined';
        setCachedFriendshipStatus(queryClient, profileId, targetId, friendshipResult(state, variables.requestId));
        if (variables.action === 'accept' && request?.sender) {
          queryClient.setQueryData(['friends', profileId], (current: any) => {
            const friends = ensureArray(current);
            return friends.some((friend: any) => friend?.id === request!.sender!.id)
              ? friends
              : [...friends, request!.sender];
          });
        }
      }
      return { snapshot };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friendship-status'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
      if (variables.action === 'accept') {
        const profileId = liveProfileId || profile?.id;
        recordChallengeActivity(profileId, 'friend_added');
      }
      toast.success(variables.action === 'accept' ? 'Friend request accepted!' : 'Friend request declined');
    },
    onError: (_error, _variables, context) => {
      restoreFriendshipCaches(queryClient, context?.snapshot);
      toast.error('Failed to update friend request');
    },
  });
}

export function useCancelFriendRequest() {
  const { profile } = useAuth();
  const liveProfileId = useAuthProfileId();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      await resolveActorProfileId(profile?.id);
      return invokeFriendshipMutation({ action: 'cancel', request_id: requestId });
    },
    onMutate: async (requestId: string) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['friend-requests'] }),
        queryClient.cancelQueries({ queryKey: ['friendship-status'] }),
      ]);
      const snapshot = snapshotFriendshipCaches(queryClient);
      let targetId: string | undefined;
      queryClient.setQueriesData(
        { queryKey: ['friend-requests'] },
        (current: any) => {
          if (!current) return current;
          const outgoing = ensureArray(current.outgoing) as FriendRequest[];
          targetId ||= outgoing.find((row) => row.id === requestId)?.receiver_id;
          return {
            ...current,
            outgoing: outgoing.filter((row) => row.id !== requestId),
          };
        },
      );
      const profileId = liveProfileId || profile?.id;
      if (profileId && targetId) {
        setCachedFriendshipStatus(queryClient, profileId, targetId, friendshipResult('cancelled'));
      } else {
        queryClient.setQueriesData(
          { queryKey: ['friendship-status'] },
          (current: any) =>
            current?.requestId === requestId ? friendshipResult('cancelled') : current,
        );
      }
      return { snapshot };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      queryClient.invalidateQueries({ queryKey: ['friendship-status'] });
      toast.success('Friend request cancelled');
    },
    onError: (_error, _requestId, context) => {
      restoreFriendshipCaches(queryClient, context?.snapshot);
      toast.error('Failed to cancel friend request');
    },
  });
}

export function useUnfriend() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (friendId: string) => {
      await resolveActorProfileId(profile?.id);
      const targetProfileId = (await normalizeToProfileId(friendId)) || friendId;
      const { data, error } = await db.functions.invoke<{
        request_id?: string | null;
        state?: FriendshipState;
      }>('get-friendship-state', { target_profile_id: targetProfileId });
      if (error) throw error;
      if (data?.state !== 'accepted' || !data.request_id) {
        throw new Error('Friendship not found');
      }
      return invokeFriendshipMutation({
        action: 'unfriend',
        request_id: data.request_id,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friendship-status'] });
      toast.success('Unfriended successfully');
    },
  });
}

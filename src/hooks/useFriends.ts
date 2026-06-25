import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { getUserProfile } from '@/lib/firebase/users';
import { toast } from 'sonner';
import { ensureArray } from '@/lib/persistedCollections';

/** Stable doc id — matches directed pair (sender → receiver). */
function friendRequestDocId(senderId: string, receiverId: string): string {
  return `${senderId}_${receiverId}`;
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
  status: 'pending' | 'accepted' | 'declined';
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
  const { profile } = useAuth();
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();

  // Real-time subscription for friend requests
  useEffect(() => {
    if (!profileId) return;

    const channel = subscribePostgresChannel(`friend-requests:${profileId}`, [
      {
        event: 'INSERT',
        table: 'friend_requests',
        filter: `receiver_id=eq.${profileId}`,
        callback: async (payload) => {
          const row = payload.new as { status?: string; sender_id?: string };
          if (row.status !== 'pending') return;

          const { data: sender } = await db
            .from('profiles')
            .select('username, display_name, avatar_url')
            .eq('id', (payload.new as any).sender_id)
            .single();
          
          const name = sender?.display_name || sender?.username || 'Someone';
          toast.success(`${name} sent you a friend request! 👋`, {
            duration: 5000,
          });
          
          queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
        },
      },
      {
        event: 'UPDATE',
        table: 'friend_requests',
        filter: `sender_id=eq.${profileId}`,
        callback: (payload) => {
          console.log('[FriendRequests] Request updated (outgoing):', payload.new);
          const status = (payload.new as any).status;
          if (status === 'accepted') {
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
      ];

      return friends;
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

export function useFriendshipStatus(targetUserId: string | undefined) {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['friendship-status', profileId, targetUserId],
    queryFn: async () => {
      if (!profileId || !targetUserId || profileId === targetUserId) {
        return { status: 'none' as const, requestId: null };
      }

      const targetProfileId = (await normalizeToProfileId(targetUserId)) || targetUserId;
      if (profileId === targetProfileId) {
        return { status: 'none' as const, requestId: null };
      }

      const outboundId = friendRequestDocId(profileId, targetProfileId);
      const inboundId = friendRequestDocId(targetProfileId, profileId);

      const { data: sentById } = await db
        .from('friend_requests')
        .select('id, status')
        .eq('id', outboundId)
        .maybeSingle();

      if (sentById) {
        return {
          status: sentById.status === 'accepted' ? 'friends' as const : 'pending_sent' as const,
          requestId: sentById.id,
        };
      }

      const { data: receivedById } = await db
        .from('friend_requests')
        .select('id, status')
        .eq('id', inboundId)
        .maybeSingle();

      if (receivedById) {
        return {
          status: receivedById.status === 'accepted' ? 'friends' as const : 'pending_received' as const,
          requestId: receivedById.id,
        };
      }

      // Check if there's a request from current user to target
      const { data: sentRequest } = await db
        .from('friend_requests')
        .select('id, status')
        .eq('sender_id', profileId)
        .eq('receiver_id', targetProfileId)
        .limit(1);

      const sentRow = sentRequest?.[0];
      if (sentRow) {
        return { 
          status: sentRow.status === 'accepted' ? 'friends' as const : 'pending_sent' as const,
          requestId: sentRow.id 
        };
      }

      // Check if there's a request from target to current user
      const { data: receivedRequest } = await db
        .from('friend_requests')
        .select('id, status')
        .eq('sender_id', targetProfileId)
        .eq('receiver_id', profileId)
        .limit(1);

      const receivedRow = receivedRequest?.[0];
      if (receivedRow) {
        return { 
          status: receivedRow.status === 'accepted' ? 'friends' as const : 'pending_received' as const,
          requestId: receivedRow.id 
        };
      }

      return { status: 'none' as const, requestId: null };
    },
    enabled: !!profileId && !!targetUserId,
    staleTime: 60000,
    placeholderData: (prev) => prev,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useSendFriendRequest() {
  const { profile } = useAuth();
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

      const [receiverProfile, sameDirectionResult, reverseDirectionResult] = await Promise.all([
        getUserProfile(receiverProfileId),
        db
          .from('friend_requests')
          .select('id, status')
          .eq('id', friendRequestDocId(profileId, receiverProfileId))
          .maybeSingle(),
        db
          .from('friend_requests')
          .select('id, status')
          .eq('id', friendRequestDocId(receiverProfileId, profileId))
          .maybeSingle(),
      ]);

      if (!receiverProfile?.id) {
        throw new Error('User not found');
      }
      const normalizedReceiver = receiverProfile.id;
      const outboundId = friendRequestDocId(profileId, normalizedReceiver);
      const inboundId = friendRequestDocId(normalizedReceiver, profileId);

      // Legacy rows used random ids — fall back to sender/receiver lookup.
      let legacySent: { data: { id: string; status: string }[] | null; error: unknown } = { data: null, error: null };
      let legacyReceived: { data: { id: string; status: string }[] | null; error: unknown } = { data: null, error: null };
      if (!sameDirectionResult.data && !reverseDirectionResult.data) {
        try {
          [legacySent, legacyReceived] = await Promise.all([
            db
              .from('friend_requests')
              .select('id, status')
              .eq('sender_id', profileId)
              .eq('receiver_id', normalizedReceiver)
              .limit(1),
            db
              .from('friend_requests')
              .select('id, status')
              .eq('sender_id', normalizedReceiver)
              .eq('receiver_id', profileId)
              .limit(1),
          ]);
        } catch (legacyErr) {
          console.warn('[Friends] legacy friend_request lookup skipped:', legacyErr);
        }
      }

      if (sameDirectionResult.error) throw sameDirectionResult.error;
      if (reverseDirectionResult.error) throw reverseDirectionResult.error;
      if ((legacySent.error as any)?.code === 'permission-denied') {
        legacySent = { data: null, error: null };
      }
      if ((legacyReceived.error as any)?.code === 'permission-denied') {
        legacyReceived = { data: null, error: null };
      }

      if (legacySent.error) throw legacySent.error;
      if (legacyReceived.error) throw legacyReceived.error;

      const existingSentRequest =
        sameDirectionResult.data ||
        (legacySent.data?.[0] as { id: string; status: string } | undefined);
      const existingReceivedRequest =
        reverseDirectionResult.data ||
        (legacyReceived.data?.[0] as { id: string; status: string } | undefined);

      if (
        existingSentRequest?.status === 'pending' ||
        existingSentRequest?.status === 'accepted' ||
        existingReceivedRequest?.status === 'pending' ||
        existingReceivedRequest?.status === 'accepted'
      ) {
        const conversationCreated = await ensureDirectConversation(profileId, normalizedReceiver);
        return { alreadyExists: true, conversationCreated };
      }

      const now = new Date().toISOString();

      if (existingSentRequest?.status === 'declined') {
        const { error: reviveError } = await db
          .from('friend_requests')
          .update({ status: 'pending', updated_at: now })
          .eq('id', existingSentRequest.id);

        if (reviveError) throw reviveError;
      } else {
        const { error: insertError } = await db.from('friend_requests').insert({
          id: outboundId,
          sender_id: profileId,
          receiver_id: normalizedReceiver,
          status: 'pending',
          created_at: now,
          updated_at: now,
        });

        if (insertError) {
          if (insertError.code === '23505') {
            const conversationCreated = await ensureDirectConversation(profileId, normalizedReceiver);
            return { alreadyExists: true, conversationCreated };
          }

          throw insertError;
        }
      }

      try {
        void db.from('notifications').insert({
          user_id: normalizedReceiver,
          actor_id: profileId,
          type: 'friend_request',
        });
      } catch (notifyErr) {
        console.warn('[Friends] friend_request notification failed:', notifyErr);
      }

      const conversationCreated = await ensureDirectConversation(profileId, normalizedReceiver);

      return { alreadyExists: false, conversationCreated };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      queryClient.invalidateQueries({ queryKey: ['friendship-status'] });
      invalidateConversationCaches(queryClient);

      if (result?.alreadyExists) return;

      toast.success(result?.conversationCreated ? 'Friend request sent! Chat created.' : 'Friend request sent!');
    },
    onError: (error: any) => {
      // Silence duplicate key errors (409/23505) - already handled in mutationFn
      if (error?.code === '23505' || error?.message?.includes('duplicate') || error?.message?.includes('already')) return;
      const msg = error instanceof Error ? error.message : String(error?.message || '');
      toast.error(msg.includes('loading') || msg.includes('not found') || msg.includes('Permission') ? msg : 'Failed to send friend request');
    },
  });
}

export function useRespondToFriendRequest() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      action
    }: {
      requestId: string;
      action: 'accept' | 'decline';
    }) => {
      const profileId = await resolveActorProfileId(profile?.id);

      const { data: request, error: requestError } = await db
        .from('friend_requests')
        .select('id, sender_id, receiver_id')
        .eq('id', requestId)
        .single();

      if (requestError) throw requestError;

      const { error } = await db
        .from('friend_requests')
        .update({
          status: action === 'accept' ? 'accepted' : 'declined',
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) throw error;

      // Notify the sender about the decision
      await db.from('notifications').insert({
        user_id: request.sender_id,
        actor_id: profileId,
        type: action === 'accept' ? 'friend_accepted' : 'friend_declined',
      });

      return request;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friendship-status'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
      toast.success(variables.action === 'accept' ? 'Friend request accepted!' : 'Friend request declined');
    },
  });
}

export function useCancelFriendRequest() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (requestId: string) => {
      const profileId = await resolveActorProfileId(profile?.id);

      const { error } = await db
        .from('friend_requests')
        .delete()
        .eq('id', requestId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      queryClient.invalidateQueries({ queryKey: ['friendship-status'] });
      toast.success('Friend request cancelled');
    },
  });
}

export function useUnfriend() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (friendId: string) => {
      const profileId = await resolveActorProfileId(profile?.id);

      // Delete friend request in either direction
      await db
        .from('friend_requests')
        .delete()
        .or(`and(sender_id.eq.${profileId},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${profileId})`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friendship-status'] });
      toast.success('Unfriended successfully');
    },
  });
}

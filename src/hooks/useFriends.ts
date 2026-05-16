import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

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
  const queryClient = useQueryClient();

  // Real-time subscription for friend requests
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`friend-requests:${profile.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friend_requests',
          filter: `receiver_id=eq.${profile.id}`,
        },
        async (payload) => {
          console.log('[FriendRequests] New incoming request:', payload.new);
          
          // Fetch sender info for the toast
          const { data: sender } = await supabase
            .from('profiles')
            .select('username, display_name, avatar_url')
            .eq('id', (payload.new as any).sender_id)
            .single();
          
          const name = sender?.display_name || sender?.username || 'Someone';
          toast.success(`${name} sent you a friend request! 👋`, {
            duration: 5000,
          });
          
          // Invalidate to refresh the list
          queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'friend_requests',
          filter: `sender_id=eq.${profile.id}`,
        },
        (payload) => {
          console.log('[FriendRequests] Request updated (outgoing):', payload.new);
          const status = (payload.new as any).status;
          if (status === 'accepted') {
            toast.success('Your friend request was accepted! 🎉');
          }
          queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
          queryClient.invalidateQueries({ queryKey: ['friends'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, queryClient]);

  return useQuery({
    queryKey: ['friend-requests', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return { incoming: [], outgoing: [] };

      const { data: incoming, error: inError } = await supabase
        .from('friend_requests')
        .select(`
          *,
          sender:profiles!sender_id(id, user_id, username, avatar_url, display_name)
        `)
        .eq('receiver_id', profile.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (inError) throw inError;

      const { data: outgoing, error: outError } = await supabase
        .from('friend_requests')
        .select(`
          *,
          receiver:profiles!receiver_id(id, user_id, username, avatar_url, display_name)
        `)
        .eq('sender_id', profile.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (outError) throw outError;

      return {
        incoming: incoming as FriendRequest[],
        outgoing: outgoing as FriendRequest[],
      };
    },
    enabled: !!profile?.id,
    staleTime: 30000, // Reduced to 30 seconds with realtime
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

export function useFriends() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['friends', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      // Get accepted friend requests where user is sender or receiver
      const { data: asSender, error: senderError } = await supabase
        .from('friend_requests')
        .select(`
          receiver:profiles!receiver_id(id, user_id, username, avatar_url, display_name)
        `)
        .eq('sender_id', profile.id)
        .eq('status', 'accepted');

      if (senderError) throw senderError;

      const { data: asReceiver, error: receiverError } = await supabase
        .from('friend_requests')
        .select(`
          sender:profiles!sender_id(id, user_id, username, avatar_url, display_name)
        `)
        .eq('receiver_id', profile.id)
        .eq('status', 'accepted');

      if (receiverError) throw receiverError;

      const friends = [
        ...(asSender || []).map((r) => r.receiver),
        ...(asReceiver || []).map((r) => r.sender),
      ];

      return friends;
    },
    enabled: !!profile?.id,
    staleTime: 2 * 60 * 1000, // 2 minutes cache
    gcTime: 1000 * 60 * 60 * 24 * 14, // 14 days — keep friends available offline for DMs
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    placeholderData: (prev) => prev,
    networkMode: 'offlineFirst',
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
  });
}

export function useFriendshipStatus(targetUserId: string | undefined) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['friendship-status', profile?.id, targetUserId],
    queryFn: async () => {
      if (!profile?.id || !targetUserId || profile.id === targetUserId) {
        return { status: 'none' as const, requestId: null };
      }

      // Check if there's a request from current user to target
      const { data: sentRequest } = await supabase
        .from('friend_requests')
        .select('id, status')
        .eq('sender_id', profile.id)
        .eq('receiver_id', targetUserId)
        .maybeSingle();

      if (sentRequest) {
        return { 
          status: sentRequest.status === 'accepted' ? 'friends' as const : 'pending_sent' as const,
          requestId: sentRequest.id 
        };
      }

      // Check if there's a request from target to current user
      const { data: receivedRequest } = await supabase
        .from('friend_requests')
        .select('id, status')
        .eq('sender_id', targetUserId)
        .eq('receiver_id', profile.id)
        .maybeSingle();

      if (receivedRequest) {
        return { 
          status: receivedRequest.status === 'accepted' ? 'friends' as const : 'pending_received' as const,
          requestId: receivedRequest.id 
        };
      }

      return { status: 'none' as const, requestId: null };
    },
    enabled: !!profile?.id && !!targetUserId,
    staleTime: 60000, // 1 minute cache
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useSendFriendRequest() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const ensureDirectConversation = async (currentUserId: string, receiverId: string) => {
    const [{ data: myMemberships }, { data: theirMemberships }] = await Promise.all([
      supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', currentUserId),
      supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', receiverId),
    ]);

    const myConversationIds = (myMemberships || []).map((membership) => membership.conversation_id);
    const theirConversationIds = (theirMemberships || []).map((membership) => membership.conversation_id);
    const sharedConversationIds = myConversationIds.filter((id) => theirConversationIds.includes(id));

    if (sharedConversationIds.length > 0) {
      const { data: sharedConversations } = await supabase
        .from('conversations')
        .select('id')
        .in('id', sharedConversationIds)
        .eq('is_group', false)
        .limit(1);

      if ((sharedConversations?.length || 0) > 0) {
        return false;
      }
    }

    // Use the SECURITY DEFINER RPC to create conversation (bypasses RLS safely)
    const { data: conversationId, error: rpcError } = await supabase.rpc('create_dm_conversation', {
      other_profile_id: receiverId,
    });

    if (rpcError) {
      console.error('[Friends] Failed to create DM conversation via RPC:', rpcError);
      return false;
    }

    return !!conversationId;
  };

  return useMutation({
    mutationFn: async (receiverId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      if (receiverId === profile.id) {
        throw new Error('Cannot send a friend request to yourself');
      }

      const [sameDirectionResult, reverseDirectionResult] = await Promise.all([
        supabase
          .from('friend_requests')
          .select('id, status')
          .eq('sender_id', profile.id)
          .eq('receiver_id', receiverId)
          .maybeSingle(),
        supabase
          .from('friend_requests')
          .select('id, status')
          .eq('sender_id', receiverId)
          .eq('receiver_id', profile.id)
          .maybeSingle(),
      ]);

      if (sameDirectionResult.error) throw sameDirectionResult.error;
      if (reverseDirectionResult.error) throw reverseDirectionResult.error;

      const existingSentRequest = sameDirectionResult.data;
      const existingReceivedRequest = reverseDirectionResult.data;

      if (
        existingSentRequest?.status === 'pending' ||
        existingSentRequest?.status === 'accepted' ||
        existingReceivedRequest?.status === 'pending' ||
        existingReceivedRequest?.status === 'accepted'
      ) {
        const conversationCreated = await ensureDirectConversation(profile.id, receiverId);
        return { alreadyExists: true, conversationCreated };
      }

      if (existingSentRequest?.status === 'declined') {
        const { error: reviveError } = await supabase
          .from('friend_requests')
          .update({ status: 'pending' })
          .eq('id', existingSentRequest.id);

        if (reviveError) throw reviveError;
      } else {
        const { error: insertError } = await supabase.from('friend_requests').insert({
          sender_id: profile.id,
          receiver_id: receiverId,
        });

        if (insertError) {
          if (insertError.code === '23505') {
            const conversationCreated = await ensureDirectConversation(profile.id, receiverId);
            return { alreadyExists: true, conversationCreated };
          }

          throw insertError;
        }
      }

      await supabase.from('notifications').insert({
        user_id: receiverId,
        actor_id: profile.id,
        type: 'friend_request',
      });

      const conversationCreated = await ensureDirectConversation(profile.id, receiverId);

      return { alreadyExists: false, conversationCreated };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      queryClient.invalidateQueries({ queryKey: ['friendship-status'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });

      if (result?.alreadyExists) return;

      toast.success(result?.conversationCreated ? 'Friend request sent! Chat created.' : 'Friend request sent!');
    },
    onError: (error: any) => {
      // Silence duplicate key errors (409/23505) - already handled in mutationFn
      if (error?.code === '23505' || error?.message?.includes('duplicate') || error?.message?.includes('already')) return;
      toast.error('Failed to send friend request');
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
      if (!profile?.id) throw new Error('Not authenticated');

      const { data: request, error: requestError } = await supabase
        .from('friend_requests')
        .select('id, sender_id, receiver_id')
        .eq('id', requestId)
        .single();

      if (requestError) throw requestError;

      const { error } = await supabase
        .from('friend_requests')
        .update({
          status: action === 'accept' ? 'accepted' : 'declined',
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (error) throw error;

      // Notify the sender about the decision
      await supabase.from('notifications').insert({
        user_id: request.sender_id,
        actor_id: profile.id,
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
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await supabase
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
      if (!profile?.id) throw new Error('Not authenticated');

      // Delete friend request in either direction
      await supabase
        .from('friend_requests')
        .delete()
        .or(`and(sender_id.eq.${profile.id},receiver_id.eq.${friendId}),and(sender_id.eq.${friendId},receiver_id.eq.${profile.id})`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      queryClient.invalidateQueries({ queryKey: ['friends'] });
      queryClient.invalidateQueries({ queryKey: ['friendship-status'] });
      toast.success('Unfriended successfully');
    },
  });
}

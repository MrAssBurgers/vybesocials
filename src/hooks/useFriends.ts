import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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

  return useQuery({
    queryKey: ['friend-requests', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return { incoming: [], outgoing: [] };

      const { data: incoming, error: inError } = await supabase
        .from('friend_requests')
        .select(`
          *,
          sender:profiles!sender_id(id, username, avatar_url, display_name)
        `)
        .eq('receiver_id', profile.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (inError) throw inError;

      const { data: outgoing, error: outError } = await supabase
        .from('friend_requests')
        .select(`
          *,
          receiver:profiles!receiver_id(id, username, avatar_url, display_name)
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
          receiver:profiles!receiver_id(id, username, avatar_url, display_name)
        `)
        .eq('sender_id', profile.id)
        .eq('status', 'accepted');

      if (senderError) throw senderError;

      const { data: asReceiver, error: receiverError } = await supabase
        .from('friend_requests')
        .select(`
          sender:profiles!sender_id(id, username, avatar_url, display_name)
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
  });
}

export function useSendFriendRequest() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (receiverId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('friend_requests')
        .insert({
          sender_id: profile.id,
          receiver_id: receiverId,
        })
        .select()
        .single();

      if (error) throw error;

      // Create notification
      await supabase.from('notifications').insert({
        user_id: receiverId,
        actor_id: profile.id,
        type: 'friend_request',
      });

      // Auto-create a conversation for instant chatting
      // First check if a conversation already exists between the two users
      const { data: existingConv } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', profile.id);

      const { data: theirConvs } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', receiverId);

      const myConvIds = (existingConv || []).map(c => c.conversation_id);
      const theirConvIds = (theirConvs || []).map(c => c.conversation_id);
      
      // Find shared non-group conversations
      const sharedConvIds = myConvIds.filter(id => theirConvIds.includes(id));
      
      let conversationExists = false;
      if (sharedConvIds.length > 0) {
        // Check if any are 1:1 (non-group) conversations
        const { data: sharedConvs } = await supabase
          .from('conversations')
          .select('id, is_group')
          .in('id', sharedConvIds)
          .eq('is_group', false);
        
        conversationExists = (sharedConvs && sharedConvs.length > 0);
      }

      // If no conversation exists, create one
      if (!conversationExists) {
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({
            is_group: false,
            created_by: profile.id,
          })
          .select()
          .single();

        if (!convError && newConv) {
          // Add both users as members
          await supabase.from('conversation_members').insert([
            { conversation_id: newConv.id, user_id: profile.id },
            { conversation_id: newConv.id, user_id: receiverId },
          ]);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] });
      queryClient.invalidateQueries({ queryKey: ['friendship-status'] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Friend request sent! Chat created.');
    },
    onError: () => {
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

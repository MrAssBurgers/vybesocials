import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface MessageRequest {
  id: string;
  sender_id: string;
  receiver_id: string;
  message_preview: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'ignored';
  created_at: string;
  responded_at: string | null;
  sender?: {
    id: string;
    username: string;
    avatar_url: string | null;
    is_verified: boolean | null;
  };
}

export function useMessageRequests() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['message-requests', profile?.id],
    queryFn: async () => {
      if (!profile) return [];

      const { data, error } = await supabase
        .from('message_requests')
        .select(`
          *,
          sender:profiles!sender_id (
            id,
            username,
            avatar_url,
            is_verified
          )
        `)
        .eq('receiver_id', profile.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as MessageRequest[];
    },
    enabled: !!profile,
  });
}

export function usePendingRequestCount() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['message-request-count', profile?.id],
    queryFn: async () => {
      if (!profile) return 0;

      const { count, error } = await supabase
        .from('message_requests')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', profile.id)
        .eq('status', 'pending');

      if (error) throw error;
      return count || 0;
    },
    enabled: !!profile,
  });
}

export function useSendMessageRequest() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      receiverId,
      messagePreview,
    }: {
      receiverId: string;
      messagePreview?: string;
    }) => {
      if (!profile) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('message_requests')
        .insert({
          sender_id: profile.id,
          receiver_id: receiverId,
          message_preview: messagePreview || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-requests'] });
    },
  });
}

export function useRespondToMessageRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      requestId,
      action,
    }: {
      requestId: string;
      action: 'accepted' | 'declined' | 'ignored';
    }) => {
      const { data, error } = await supabase
        .from('message_requests')
        .update({
          status: action,
          responded_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-requests'] });
      queryClient.invalidateQueries({ queryKey: ['message-request-count'] });
    },
  });
}

// Check if user can DM without a request
export function useCanSendDM(receiverId: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['can-send-dm', profile?.id, receiverId],
    queryFn: async () => {
      if (!profile || !receiverId) return false;
      if (profile.id === receiverId) return true;

      const { data, error } = await supabase
        .rpc('can_send_dm', {
          sender_id: profile.id,
          receiver_id: receiverId,
        });

      if (error) throw error;
      return data as boolean;
    },
    enabled: !!profile && !!receiverId,
  });
}

// Check if there's a pending request
export function useExistingRequest(receiverId: string) {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['existing-request', profile?.id, receiverId],
    queryFn: async () => {
      if (!profile || !receiverId) return null;

      const { data, error } = await supabase
        .from('message_requests')
        .select('*')
        .eq('sender_id', profile.id)
        .eq('receiver_id', receiverId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data as MessageRequest | null;
    },
    enabled: !!profile && !!receiverId,
  });
}

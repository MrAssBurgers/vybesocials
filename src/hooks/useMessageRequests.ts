import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';

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
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['message-requests', profileId],
    queryFn: async () => {
      if (!profileId) return [];

      const { data, error } = await db
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
        .eq('receiver_id', profileId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as MessageRequest[];
    },
    enabled: !!profileId,
    networkMode: 'always',
    select: (data) => (Array.isArray(data) ? data : []),
  });
}

export function usePendingRequestCount() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['message-request-count', profileId],
    queryFn: async () => {
      if (!profileId) return 0;

      const { count, error } = await db
        .from('message_requests')
        .select('id', { count: 'exact', head: true })
        .eq('receiver_id', profileId)
        .eq('status', 'pending');

      if (error) throw error;
      return count || 0;
    },
    enabled: !!profileId,
    networkMode: 'always',
  });
}

export function useSendMessageRequest() {
  const queryClient = useQueryClient();
  const profileId = useAuthProfileId();

  return useMutation({
    mutationFn: async ({
      receiverId,
      messagePreview,
    }: {
      receiverId: string;
      messagePreview?: string;
    }) => {
      if (!profileId) throw new Error('Not authenticated');

      const { data, error } = await db
        .from('message_requests')
        .insert({
          sender_id: profileId,
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
      const { data, error } = await db
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

export function useCanSendDM(receiverId: string) {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['can-send-dm', profileId, receiverId],
    queryFn: async () => {
      if (!profileId || !receiverId) return false;
      if (profileId === receiverId) return true;

      const { data, error } = await db.rpc('can_send_dm', {
        sender_id: profileId,
        receiver_id: receiverId,
      });

      if (error) throw error;
      return data as boolean;
    },
    enabled: !!profileId && !!receiverId,
  });
}

export function useExistingRequest(receiverId: string) {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['existing-request', profileId, receiverId],
    queryFn: async () => {
      if (!profileId || !receiverId) return null;

      const { data, error } = await db
        .from('message_requests')
        .select('*')
        .eq('sender_id', profileId)
        .eq('receiver_id', receiverId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data as MessageRequest | null;
    },
    enabled: !!profileId && !!receiverId,
  });
}

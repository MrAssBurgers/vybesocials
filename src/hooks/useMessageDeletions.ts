import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

/**
 * Unsend a message for everyone (soft delete via UPDATE)
 * Sets is_deleted = true, clears content/media
 */
export function useUnsendMessage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Verify ownership first
      const { data: message, error: fetchError } = await supabase
        .from('messages')
        .select('sender_id, conversation_id')
        .eq('id', messageId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!message) throw new Error('Message not found');

      if (message.sender_id !== profile.id) {
        throw new Error('You can only unsend your own messages');
      }

      // Soft delete - UPDATE existing row (no INSERT)
      const { error } = await supabase
        .from('messages')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          content: null,
          media_url: null,
        })
        .eq('id', messageId)
        .eq('sender_id', profile.id); // Extra safety

      if (error) throw error;

      return message.conversation_id;
    },
    onSuccess: (conversationId) => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      toast.success('Message unsent');
    },
    onError: (error: any) => {
      console.error('Failed to unsend message:', error);
      toast.error(error?.message || 'Failed to unsend message');
    },
  });
}

/**
 * Delete a message for the current user only
 * Uses separate message_deletions table (no touching messages row)
 */
export function useDeleteMessageForMe() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Get conversation ID first for cache invalidation
      const { data: message, error: fetchError } = await supabase
        .from('messages')
        .select('conversation_id')
        .eq('id', messageId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!message) throw new Error('Message not found');

      // Insert into message_deletions (uses RLS to ensure user_id = current user)
      const { error } = await supabase
        .from('message_deletions')
        .upsert({
          message_id: messageId,
          user_id: profile.id,
          deleted_at: new Date().toISOString(),
        }, {
          onConflict: 'message_id,user_id',
        });

      if (error) throw error;

      return message.conversation_id;
    },
    onSuccess: (conversationId) => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['my-message-deletions'] });
      toast.success('Message deleted for you');
    },
    onError: (error: any) => {
      console.error('Failed to delete message:', error);
      toast.error(error?.message || 'Failed to delete message');
    },
  });
}

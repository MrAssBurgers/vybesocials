import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

// Unsend message for everyone (soft delete - shows "Message unsent" placeholder)
export function useUnsendForEveryone() {
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

      // Soft delete - mark as deleted so it shows "Message unsent" to both users
      const { error } = await supabase
        .from('messages')
        .update({ 
          is_deleted: true,
          deleted_at: new Date().toISOString(),
        })
        .eq('id', messageId);

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

// Delete message for current user only (hide from their view)
export function useDeleteForMe() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Get current deleted_for_users array and add current user
      const { data: message, error: fetchError } = await supabase
        .from('messages')
        .select('conversation_id, deleted_for_users')
        .eq('id', messageId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!message) throw new Error('Message not found');

      const currentDeletedFor = (message.deleted_for_users as string[]) || [];
      if (!currentDeletedFor.includes(profile.id)) {
        currentDeletedFor.push(profile.id);
      }

      const { error } = await supabase
        .from('messages')
        .update({ 
          deleted_for_users: currentDeletedFor
        })
        .eq('id', messageId);

      if (error) throw error;

      return message.conversation_id;
    },
    onSuccess: (conversationId) => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      toast.success('Message deleted for you');
    },
    onError: (error: any) => {
      console.error('Failed to delete message:', error);
      toast.error(error?.message || 'Failed to delete message');
    },
  });
}

// Edit message (text only, own messages only)
export function useEditMessage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ messageId, newContent }: { messageId: string; newContent: string }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Verify ownership
      const { data: message, error: fetchError } = await supabase
        .from('messages')
        .select('sender_id, conversation_id, content')
        .eq('id', messageId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!message) throw new Error('Message not found');
      
      if (message.sender_id !== profile.id) {
        throw new Error('You can only edit your own messages');
      }

      const { error } = await supabase
        .from('messages')
        .update({ 
          content: newContent,
          is_edited: true,
          edited_at: new Date().toISOString(),
        })
        .eq('id', messageId);

      if (error) throw error;

      return message.conversation_id;
    },
    onSuccess: (conversationId) => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      toast.success('Message edited');
    },
    onError: (error: any) => {
      console.error('Failed to edit message:', error);
      toast.error(error?.message || 'Failed to edit message');
    },
  });
}

// Report a message
export function useReportMessage() {
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ messageId, reason }: { messageId: string; reason: string }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // For now, just log the report - in production this would go to a moderation queue
      console.log('Message reported:', { messageId, reason, reporterId: profile.id });
      
      // You could create a message_reports table and insert here
      return { success: true };
    },
    onSuccess: () => {
      toast.success('Message reported. Thank you for helping keep our community safe.');
    },
    onError: (error: any) => {
      toast.error('Failed to report message');
    },
  });
}

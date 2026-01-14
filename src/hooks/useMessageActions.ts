import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Message } from './useMessages';

/**
 * Unsend message for everyone (soft delete via UPDATE - no new row insertion)
 * Sets is_deleted = true, clears content/media on existing row
 * Now with instant optimistic UI updates
 */
export function useUnsendForEveryone() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Get the message to verify ownership and get conversation_id
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

      // Return conversation_id for optimistic update before the actual mutation
      return { messageId, conversationId: message.conversation_id };
    },
    onMutate: async (messageId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['messages'] });

      // We'll update optimistically after we get the conversation_id
      return { messageId };
    },
    onSuccess: async ({ messageId, conversationId }) => {
      // Optimistically remove from cache immediately
      queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
        if (!old) return old;
        return old.filter(m => m.id !== messageId);
      });

      // Now perform the actual database update
      const { error } = await supabase
        .from('messages')
        .update({ 
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          content: null,
          media_url: null,
        })
        .eq('id', messageId)
        .eq('sender_id', profile?.id);

      if (error) {
        // Revert on error
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        throw error;
      }

      // Update conversation list
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
 * Delete message for current user only (uses separate table, no touching messages row)
 * Now with instant optimistic UI updates
 */
export function useDeleteForMe() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Get conversation ID for cache invalidation
      const { data: message, error: fetchError } = await supabase
        .from('messages')
        .select('conversation_id')
        .eq('id', messageId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!message) throw new Error('Message not found');

      return { messageId, conversationId: message.conversation_id };
    },
    onSuccess: async ({ messageId, conversationId }) => {
      // Optimistically remove from cache immediately
      queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
        if (!old) return old;
        return old.filter(m => m.id !== messageId);
      });

      // Insert into message_deletions table
      const { error } = await supabase
        .from('message_deletions')
        .upsert({
          message_id: messageId,
          user_id: profile?.id,
        }, {
          onConflict: 'message_id,user_id',
        });

      if (error) {
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        throw error;
      }

      toast.success('Message deleted for you');
    },
    onError: (error: any) => {
      console.error('Failed to delete message:', error);
      toast.error(error?.message || 'Failed to delete message');
    },
  });
}

/**
 * Edit message (text only, own messages only)
 * Now with instant optimistic UI updates
 */
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

      return { messageId, newContent, conversationId: message.conversation_id, oldContent: message.content };
    },
    onSuccess: async ({ messageId, newContent, conversationId }) => {
      // Optimistically update the message in cache immediately
      queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
        if (!old) return old;
        return old.map(m => {
          if (m.id === messageId) {
            return {
              ...m,
              content: newContent,
              is_edited: true,
              edited_at: new Date().toISOString(),
            };
          }
          return m;
        });
      });

      // Now perform the actual database update
      const { error } = await supabase
        .from('messages')
        .update({ 
          content: newContent,
          is_edited: true,
          edited_at: new Date().toISOString(),
        })
        .eq('id', messageId);

      if (error) {
        // Revert on error
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        throw error;
      }

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

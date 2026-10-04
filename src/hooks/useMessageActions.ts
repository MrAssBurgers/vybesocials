import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { invalidateConversationCaches } from '@/lib/invalidateConversationCaches';
import type { Message } from '@/hooks/useMessages';

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

      if (messageId.startsWith('temp-')) {
        const cached = queryClient
          .getQueriesData<Message[]>({ queryKey: ['messages'] })
          .find(([, msgs]) => Array.isArray(msgs) && msgs.some((m) => m.id === messageId));
        const queryKey = cached?.[0];
        const conversationId = Array.isArray(queryKey)
          ? (queryKey[1] as string | undefined)
          : undefined;
        if (!conversationId) throw new Error('Message is still sending');
        return { messageId, conversationId };
      }

      const { data: message, error: fetchError } = await db
        .from('messages')
        .select('sender_id, conversation_id')
        .eq('id', messageId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!message) throw new Error('Message not found');
      if (message.sender_id !== profile.id) {
        throw new Error('You can only unsend your own messages');
      }

      const { error } = await db
        .from('messages')
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          content: null,
          media_url: null,
        })
        .eq('id', messageId);

      if (error) throw error;

      return { messageId, conversationId: message.conversation_id as string };
    },
    onMutate: async (messageId) => {
      await queryClient.cancelQueries({ queryKey: ['messages'] });
      return { messageId };
    },
    onSuccess: ({ messageId, conversationId }) => {
      queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
        if (!old) return old;
        return old.filter((m) => m.id !== messageId);
      });

      invalidateConversationCaches(queryClient);
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
      const { data: message, error: fetchError } = await db
        .from('messages')
        .select('conversation_id')
        .eq('id', messageId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!message) throw new Error('Message not found');

      // Insert into message_deletions table in mutationFn
      const { error } = await db
        .from('message_deletions')
        .upsert({
          message_id: messageId,
          user_id: profile.id,
        }, {
          onConflict: 'message_id,user_id',
        });

      if (error) throw error;

      return { messageId, conversationId: message.conversation_id };
    },
    onSuccess: ({ messageId, conversationId }) => {
      // Remove from cache after successful DB update
      queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
        if (!old) return old;
        return old.filter(m => m.id !== messageId);
      });

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

      // Verify ownership + grab conversation_id for cache updates
      const { data: message, error: fetchError } = await db
        .from('messages')
        .select('sender_id, conversation_id, created_at')
        .eq('id', messageId)
        .maybeSingle();

      if (fetchError) throw fetchError;
      if (!message) throw new Error('Message not found');
      if (message.sender_id !== profile.id) {
        throw new Error('You can only edit your own messages');
      }
      // Client-side guard so users see the right error even before hitting the RPC
      const ageMs = Date.now() - new Date(message.created_at).getTime();
      if (ageMs > 15 * 60 * 1000) {
        throw new Error("It's been more than 15 minutes — you can no longer edit this");
      }

      return { messageId, newContent, conversationId: message.conversation_id };
    },
    onSuccess: async ({ messageId, newContent, conversationId }) => {
      // Optimistic update
      queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
        if (!old) return old;
        return old.map(m => m.id === messageId
          ? { ...m, content: newContent, is_edited: true, edited_at: new Date().toISOString() }
          : m
        );
      });

      // Server-side 15-min enforcement via SECURITY DEFINER RPC
      const { error } = await db.rpc('edit_message', {
        p_message_id: messageId,
        p_new_content: newContent,
      });

      if (error) {
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        toast.error(error.message || 'Failed to edit message');
        return;
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

      // Private message evidence needs its own membership-verified contract.
      // Do not log message details or acknowledge an unsubmitted report.
      throw new Error('Message-specific reporting is not available yet. You can report or block the account from its profile.');
    },
    onError: (error: any) => {
      toast.error(error instanceof Error ? error.message : 'The message report was not submitted.');
    },
  });
}

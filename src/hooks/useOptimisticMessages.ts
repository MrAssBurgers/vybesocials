import { useState, useCallback, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { ViewMode } from './useMessages';
import { enqueue as outboxEnqueue, onOutboxChange, flush as outboxFlush } from '@/lib/dmOutbox';

export type MessageStatus = 'sending' | 'sent' | 'failed';

export interface OptimisticMessage {
  tempId: string;
  conversationId: string;
  content: string;
  viewMode: ViewMode;
  status: MessageStatus;
  createdAt: string;
  error?: string;
}

export function useOptimisticMessages(conversationId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);

  const sendMutation = useMutation({
    mutationFn: async ({
      tempId,
      content,
      viewMode,
      mediaUrl,
      mediaType,
      replyToId,
    }: {
      tempId: string;
      content?: string;
      viewMode?: ViewMode;
      mediaUrl?: string;
      mediaType?: string;
      replyToId?: string;
    }) => {
      if (!profile?.id || !conversationId) throw new Error('Not authenticated');

      const expiresAt = viewMode === '24h' 
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        : null;

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: profile.id,
          content,
          media_url: mediaUrl,
          media_type: mediaType,
          view_mode: viewMode || 'permanent',
          expires_at: expiresAt,
          reply_to_id: replyToId,
        })
        .select()
        .single();

      if (error) throw error;

      // Update conversation updated_at
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      return { data, tempId };
    },
    onSuccess: ({ tempId }) => {
      // Remove optimistic message on success
      setOptimisticMessages((prev) => prev.filter((m) => m.tempId !== tempId));
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (error, variables) => {
      // Mark as failed
      setOptimisticMessages((prev) =>
        prev.map((m) =>
          m.tempId === variables.tempId
            ? { ...m, status: 'failed' as MessageStatus, error: (error as Error).message }
            : m
        )
      );
    },
  });

  const send = useCallback(
    (content: string, viewMode: ViewMode = 'permanent') => {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      
      if (!conversationId) return;

      // Add optimistic message
      const optimisticMsg: OptimisticMessage = {
        tempId,
        conversationId,
        content,
        viewMode,
        status: 'sending',
        createdAt: new Date().toISOString(),
      };

      setOptimisticMessages((prev) => [...prev, optimisticMsg]);

      // Fire mutation
      sendMutation.mutate({ tempId, content, viewMode });
    },
    [conversationId, sendMutation]
  );

  const retry = useCallback(
    (tempId: string) => {
      const msg = optimisticMessages.find((m) => m.tempId === tempId);
      if (!msg) return;

      // Update status to sending
      setOptimisticMessages((prev) =>
        prev.map((m) =>
          m.tempId === tempId ? { ...m, status: 'sending' as MessageStatus, error: undefined } : m
        )
      );

      // Retry mutation
      sendMutation.mutate({ tempId, content: msg.content, viewMode: msg.viewMode });
    },
    [optimisticMessages, sendMutation]
  );

  const dismiss = useCallback((tempId: string) => {
    setOptimisticMessages((prev) => prev.filter((m) => m.tempId !== tempId));
  }, []);

  return {
    optimisticMessages: optimisticMessages.filter((m) => m.conversationId === conversationId),
    send,
    retry,
    dismiss,
    isPending: sendMutation.isPending,
  };
}

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
      const msg = (error as Error)?.message || '';
      const isNetwork =
        typeof navigator !== 'undefined' && navigator.onLine === false ||
        /network|failed to fetch|timeout|fetch/i.test(msg);

      // Offline / transient failure → queue for automatic retry on reconnect.
      // Keep the optimistic bubble visible as "sending" so the user sees it.
      if (isNetwork && profile?.id && conversationId) {
        const expiresAt =
          variables.viewMode === '24h'
            ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            : null;
        void outboxEnqueue({
          tempId: variables.tempId,
          conversationId,
          senderId: profile.id,
          content: variables.content,
          mediaUrl: variables.mediaUrl,
          mediaType: variables.mediaType,
          viewMode: variables.viewMode || 'permanent',
          replyToId: variables.replyToId,
          expiresAt,
        });
        return;
      }

      // Hard failure (e.g. permission denied) → surface to UI for retry.
      setOptimisticMessages((prev) =>
        prev.map((m) =>
          m.tempId === variables.tempId
            ? { ...m, status: 'failed' as MessageStatus, error: msg }
            : m
        )
      );
    },
  });

  // When the outbox flushes successfully, drop the matching optimistic bubble
  // and refetch the thread so the real message replaces it.
  useEffect(() => {
    const off = onOutboxChange(() => {
      setOptimisticMessages((prev) => prev);
      if (conversationId) {
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
    });
    return off;
  }, [conversationId, queryClient]);

  // Kick a flush on mount in case we have queued items waiting.
  useEffect(() => {
    void outboxFlush();
  }, []);

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

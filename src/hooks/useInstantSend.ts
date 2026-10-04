import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { Message, ViewMode } from './useMessages';
import { registerOptimisticMessage } from './useGlobalRealtimeMessages';
import { inferOtherParticipantId } from '@/lib/dmMembershipRepair';
import { patchMessagesCache, replaceOptimisticMessage, isMessageSessionCurrent } from '@/lib/messagesQueryKey';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { reportAccountGuard } from '@/lib/reportModerationService';
import { dmListQueryKey, ownedDmProfileId } from '@/lib/dmAccountScope';
import { toast } from 'sonner';
import { inferOtherUserIdFromConversation } from '@/lib/dmMemberResolve';
import { patchDmConversationActivity, sortDmConversations } from '@/lib/dmConversationSort';
import { findInQueryArray } from '@/lib/persistedCollections';
import {
  expiresAtForViewMode,
  insertDmMessage,
  isTransientSendError,
} from '@/lib/dmSendCore';
import { enqueue as outboxEnqueue } from '@/lib/dmOutbox';
import { prewarmDmBroadcastChannel, sendDmBroadcastMessage } from '@/lib/dmBroadcast';

export interface PendingMessage {
  tempId: string;
  content?: string;
  mediaUrl?: string;
  mediaType?: string;
  viewMode: ViewMode;
  replyToId?: string;
  status: 'processing' | 'uploading' | 'sending' | 'sent' | 'failed';
  createdAt: string;
  error?: string;
  uploadProgress?: number;
  thumbnail?: string;
  duration?: number;
}

/**
 * Snapchat-style instant message sending
 * Messages appear immediately, then sync with server
 */
export function useInstantSend(conversationId: string | undefined) {
  const session = useReportAccountSession();
  const { profile, user } = useAuth();
  // Native Auth can update before AuthProvider renders the new profile. A new
  // native session must not authorize the previous account's visible composer.
  const effectiveProfileId = user?.id === session.uid && profile?.user_id === session.uid
    ? ownedDmProfileId(session.uid, profile) : undefined;
  const currentView = useRef({ conversationId, session, effectiveProfileId });
  currentView.current = { conversationId, session, effectiveProfileId };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const accountGuard = useMemo(() => {
    const guard = reportAccountGuard(user?.id || '');
    return () => {
      guard();
      const view = currentView.current;
      if (!mounted.current || !effectiveProfileId || !session.uid || user?.id !== session.uid
        || profile?.user_id !== session.uid || !isMessageSessionCurrent(session)
        || view.session !== session || view.effectiveProfileId !== effectiveProfileId || view.conversationId !== conversationId) {
        throw Object.assign(new Error('Your chat account changed. Open this chat again before sending.'), { code: 'account-changed' });
      }
    };
  }, [session, user?.id, profile?.user_id, effectiveProfileId, conversationId]);
  const isCurrentOperation = useCallback(() => { try { accountGuard(); return true; } catch { return false; } }, [accountGuard]);
  const queryClient = useQueryClient();
  
  const pendingMessagesRef = useRef<Map<string, PendingMessage>>(new Map());
  const [videoUploadProgress, setVideoUploadProgress] = useState<Record<string, number>>({});
  useEffect(() => { pendingMessagesRef.current.clear(); setVideoUploadProgress({}); }, [session, effectiveProfileId, conversationId]);

  useEffect(() => {
    if (isCurrentOperation()) prewarmDmBroadcastChannel(conversationId);
  }, [conversationId, isCurrentOperation]);

  // Generate a temporary ID for optimistic updates
  const generateTempId = useCallback(() => {
    return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }, []);

  // Add message to cache optimistically
  const addOptimisticMessage = useCallback((
    tempId: string,
    message: Partial<Message>,
    senderIdOverride?: string,
  ) => {
    if (!conversationId || !effectiveProfileId || !isCurrentOperation()) return false;
    accountGuard();

    const senderId = senderIdOverride || effectiveProfileId;
    if (senderId !== effectiveProfileId) throw new Error('This message sender could not be verified.');

    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: senderId,
      content: message.content || null,
      media_url: message.media_url || null,
      media_type: message.media_type || null,
      message_type: 'text',
      view_mode: (message.view_mode || 'permanent') as ViewMode,
      expires_at: null,
      is_deleted: false,
      reply_to_id: message.reply_to_id || null,
      created_at: new Date().toISOString(),
      sender: {
        id: senderId,
        username: profile?.username || '',
        avatar_url: profile?.avatar_url || null,
        display_name: (profile as any)?.display_name || profile?.username || null,
      },
      views: [],
      reactions: [],
      _clientKey: tempId,
    };

    // Add to messages cache immediately (must match useMessages query key).
    patchMessagesCache(queryClient, conversationId, (old) => {
      if (!old) return [optimisticMessage];
      return [...old, optimisticMessage];
    }, session);

    void sendDmBroadcastMessage(conversationId, optimisticMessage as unknown as Record<string, unknown>);

    // Helper to update conversation lists
    const updateConversationList = (old: any[] | undefined) => {
      if (!old) return old;

      const updated = old.map((conv) => {
        if (conv.id !== conversationId) return conv;
        return patchDmConversationActivity(conv, {
          id: tempId,
          content: message.content ?? null,
          media_type: message.media_type ?? null,
          media_url: message.media_url ?? null,
          message_type: message.media_type ? 'media' : 'text',
          created_at: optimisticMessage.created_at,
          sender_id: senderId,
        });
      });
      return sortDmConversations(updated, effectiveProfileId);
    };

    // Update BOTH conversation query keys immediately for instant sync
    if (effectiveProfileId) {
      queryClient.setQueryData<any[]>(['conversations', effectiveProfileId, session.uid, session.epoch], updateConversationList);
      queryClient.setQueryData<any[]>(dmListQueryKey(effectiveProfileId, session), updateConversationList);
    }

    return true;
  }, [conversationId, effectiveProfileId, profile, queryClient, session, accountGuard, isCurrentOperation]);

  const confirmMessage = useCallback((tempId: string, realMessage: Message) => {
    if (!conversationId || !isCurrentOperation()) return;
    replaceOptimisticMessage(queryClient, conversationId, tempId, realMessage, session);
    pendingMessagesRef.current.delete(tempId);
  }, [conversationId, queryClient, session, isCurrentOperation]);

  // Mark message as failed
  const markFailed = useCallback((tempId: string, error: string) => {
    if (!conversationId || !effectiveProfileId || !isCurrentOperation()) return;

    const pending = pendingMessagesRef.current.get(tempId);

    patchMessagesCache(queryClient, conversationId, (old) => {
      const rows = old ?? [];
      const idx = rows.findIndex((m) => m.id === tempId);
      if (idx >= 0) {
        return rows.map((m) =>
          m.id === tempId ? ({ ...m, _failed: true, _error: error } as any) : m,
        );
      }

      if (!pending) return rows.length ? rows : old;

      const failedRow: Message = {
        id: tempId,
        conversation_id: conversationId,
        sender_id: effectiveProfileId,
        content: pending.content ?? null,
        media_url: pending.mediaUrl ?? null,
        media_type: pending.mediaType ?? null,
        message_type: pending.mediaType ? 'media' : 'text',
        view_mode: pending.viewMode,
        expires_at: null,
        is_deleted: false,
        reply_to_id: pending.replyToId ?? null,
        created_at: pending.createdAt,
        sender: {
          id: effectiveProfileId,
          username: profile?.username || '',
          avatar_url: profile?.avatar_url || null,
          display_name: (profile as any)?.display_name || profile?.username || null,
        },
        views: [],
        reactions: [],
        _failed: true,
        _error: error,
      } as any;

      return [...rows, failedRow];
    }, session);

    if (pending) {
      pending.status = 'failed';
      pending.error = error;
    }
  }, [conversationId, effectiveProfileId, profile, queryClient, session, isCurrentOperation]);

  // Remove a message from cache
  const removeMessage = useCallback((tempId: string) => {
    if (!conversationId || !isCurrentOperation()) return;

    patchMessagesCache(queryClient, conversationId, (old) => {
      if (!old) return old;
      return old.filter(m => m.id !== tempId);
    }, session);

    pendingMessagesRef.current.delete(tempId);
  }, [conversationId, queryClient, session, isCurrentOperation]);

  const ensureSendReady = useCallback(async (): Promise<string> => {
    accountGuard();
    if (!conversationId) throw new Error('No conversation');
    if (!effectiveProfileId) throw new Error('Not authenticated');
    // New chats are created by createDmChat. Every send is authorized and its
    // membership aliases repaired by the canonical server callable; never
    // perform identity/membership writes from an asynchronous composer warmup.
    return effectiveProfileId;
  }, [conversationId, effectiveProfileId, accountGuard]);

  const resolveOtherProfileId = useCallback(
    (senderId: string) => {
      const cachedConv =
        findInQueryArray(queryClient.getQueryData<any[]>(dmListQueryKey(senderId, session)), (c) => c.id === conversationId) ??
        findInQueryArray(queryClient.getQueryData<any[]>(['conversations', senderId, session.uid, session.epoch]), (c) => c.id === conversationId);
      accountGuard();
      const authUid = session.uid ?? null;
      return (
        (cachedConv &&
          inferOtherUserIdFromConversation(cachedConv, senderId, authUid)) ||
        inferOtherParticipantId(conversationId!, senderId) ||
        null
      );
    },
    [conversationId, queryClient, session, accountGuard],
  );

  const resolveSenderIdForSend = useCallback(async (): Promise<string> => {
    accountGuard();
    return ensureSendReady();
  }, [ensureSendReady, accountGuard]);

  const insertMessageWithRetry = useCallback(
    async (
      senderId: string,
      payload: Record<string, unknown>,
      otherProfileId: string | null,
    ) => {
      const senderName =
        profile?.display_name || profile?.username || 'Someone';
      const preview =
        typeof payload.content === 'string' && payload.content.trim()
          ? payload.content.trim().slice(0, 80)
          : undefined;
      return insertDmMessage(
        { ...payload, sender_id: senderId } as Parameters<typeof insertDmMessage>[0],
        {
          accountGuard,
          otherProfileId,
          push: { senderName, preview },
        },
      );
    },
    [profile?.display_name, profile?.username, accountGuard],
  );

  // Send a text message instantly
  const sendText = useCallback(async (
    content: string, 
    viewMode: ViewMode = 'permanent',
    replyToId?: string,
    onOptimisticAdded?: () => void,
  ) => {
    accountGuard();
    if (!conversationId || !effectiveProfileId || !content.trim()) {
      throw new Error('Not ready to send yet — try again in a moment.');
    }

    const tempId = generateTempId();
    const createdAt = new Date().toISOString();
    
    // Track pending message
    pendingMessagesRef.current.set(tempId, {
      tempId,
      content,
      viewMode,
      replyToId,
      status: 'sending',
      createdAt,
    });

    // Show bubble immediately — never block paint on membership repair / server round-trip.
    const added = addOptimisticMessage(
      tempId,
      { content, view_mode: viewMode, reply_to_id: replyToId },
      effectiveProfileId,
    );
    if (!added) {
      pendingMessagesRef.current.delete(tempId);
      throw new Error('Could not show message — try again.');
    }
    registerOptimisticMessage(conversationId, content, effectiveProfileId);
    onOptimisticAdded?.();

    void (async () => {
    try {
      const senderId = await resolveSenderIdForSend();
      accountGuard();
      const otherProfileId = resolveOtherProfileId(senderId);

      const expiresAt = expiresAtForViewMode(viewMode);

      const insertPayload = {
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        message_type: 'text',
        view_mode: viewMode,
        expires_at: expiresAt,
        reply_to_id: replyToId,
        client_message_id: tempId,
      };

      const insertPromise = insertMessageWithRetry(
        senderId,
        insertPayload,
        otherProfileId,
      );

      const { data, error } = await insertPromise;
      accountGuard();

      if (error) throw error;
      if (!data) throw new Error('Failed to send message');

      confirmMessage(tempId, data);
      void sendDmBroadcastMessage(conversationId, data as unknown as Record<string, unknown>);

    } catch (error: any) {
      if (!isCurrentOperation()) return;
      if (isTransientSendError(error) && conversationId && effectiveProfileId) {
        const pending = pendingMessagesRef.current.get(tempId);
        try {
          await outboxEnqueue({
            tempId,
            conversationId,
            senderId: effectiveProfileId,
            content: pending?.content,
            viewMode: pending?.viewMode || viewMode,
            replyToId: pending?.replyToId,
            expiresAt: expiresAtForViewMode(viewMode),
          }, session);
          accountGuard();
          toast.info('Message queued — will send when you\'re back online', { duration: 3500 });
        } catch {
          if (isCurrentOperation()) {
            markFailed(tempId, 'Could not save this message for retry.');
            toast.error('Message was not queued. Keep this chat open and try again.');
          }
        }
        return;
      }
      console.error('Failed to send message:', error);
      markFailed(tempId, error.message || 'Failed to send');
      toast.error('Message failed to send');
    }
    })();
  }, [conversationId, profile?.id, effectiveProfileId, generateTempId, addOptimisticMessage, confirmMessage, markFailed, resolveSenderIdForSend, insertMessageWithRetry, resolveOtherProfileId, accountGuard, session, isCurrentOperation]);

  // Send media message
  const sendMedia = useCallback(async (
    mediaUrl: string,
    mediaType: string,
    viewMode: ViewMode = 'permanent',
    replyToId?: string
  ) => {
    accountGuard();
    if (!conversationId || !effectiveProfileId) return;

    const tempId = generateTempId();
    
    pendingMessagesRef.current.set(tempId, {
      tempId,
      mediaUrl,
      mediaType,
      viewMode,
      replyToId,
      status: 'sending',
      createdAt: new Date().toISOString(),
    });

    addOptimisticMessage(tempId, { 
      media_url: mediaUrl, 
      media_type: mediaType, 
      view_mode: viewMode, 
      reply_to_id: replyToId 
    });

    try {
      const senderId = await resolveSenderIdForSend();
      accountGuard();
      const otherProfileId =
        inferOtherParticipantId(conversationId!, senderId) || null;
      const expiresAt = expiresAtForViewMode(viewMode);

      const { data, error } = await insertMessageWithRetry(
        senderId,
        {
          conversation_id: conversationId,
          sender_id: senderId,
          media_url: mediaUrl,
          media_type: mediaType,
          message_type: mediaType === 'image' ? 'image' : 'media',
          view_mode: viewMode,
          expires_at: expiresAt,
          reply_to_id: replyToId,
          client_message_id: tempId,
        },
        otherProfileId,
      );

      accountGuard();
      if (error) throw error;
      if (!data) throw new Error('Failed to send media');

      confirmMessage(tempId, data);
      void sendDmBroadcastMessage(conversationId, data as unknown as Record<string, unknown>);

      return data;
    } catch (error: any) {
      if (!isCurrentOperation()) throw error;
      console.error('Failed to send media:', error);
      markFailed(tempId, error.message || 'Failed to send');
      throw error;
    }
  }, [conversationId, profile?.id, effectiveProfileId, generateTempId, addOptimisticMessage, confirmMessage, markFailed, resolveSenderIdForSend, insertMessageWithRetry, accountGuard, session, isCurrentOperation]);

  // Send video with optimistic UI and progress tracking
  const sendVideo = useCallback(async (
    file: File,
    thumbnail: string,
    duration: number,
    viewMode: ViewMode = 'permanent',
    replyToId?: string,
    caption?: string
  ) => {
    accountGuard();
    if (!conversationId || !effectiveProfileId) return;

    const tempId = generateTempId();
    const localUrl = URL.createObjectURL(file);
    
    // Track pending message with video-specific metadata
    pendingMessagesRef.current.set(tempId, {
      tempId,
      mediaUrl: localUrl,
      mediaType: 'video',
      viewMode,
      replyToId,
      status: 'uploading',
      createdAt: new Date().toISOString(),
      uploadProgress: 0,
      thumbnail,
      duration,
    });

    // Add optimistic message with thumbnail
    addOptimisticMessage(tempId, { 
      media_url: thumbnail, // Show thumbnail initially
      media_type: 'video',
      content: caption,
      view_mode: viewMode, 
      reply_to_id: replyToId 
    });

    // Initialize progress
    setVideoUploadProgress(prev => ({ ...prev, [tempId]: 0 }));

    try {
      // Simulate upload progress (real progress would come from XHR)
      const updateProgress = (p: number) => {
        accountGuard();
        setVideoUploadProgress(prev => ({ ...prev, [tempId]: p }));
        const pending = pendingMessagesRef.current.get(tempId);
        if (pending) {
          pending.uploadProgress = p;
        }
      };

      updateProgress(10);

      // Firebase storage paths belong to the initiating authenticated account.
      if (!session.uid || profile?.user_id !== session.uid) {
        throw new Error('Account not ready - please refresh and try again');
      }
      const fileExt = file.name.split('.').pop() || 'mp4';
      const fileName = `${session.uid}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      
      updateProgress(30);
      
      const { data: uploadData, error: uploadError } = await db.storage
        .from('chat-media')
        .upload(fileName, file, {
          contentType: file.type,
          cacheControl: '3600',
        });

      if (uploadError) throw uploadError;
      
      updateProgress(70);

      // Get public URL
      const { data: urlData } = db.storage
        .from('chat-media')
        .getPublicUrl(fileName);
      
      const mediaUrl = urlData.publicUrl;
      
      updateProgress(85);

      const senderId = await ensureSendReady();
      accountGuard();
      const otherProfileId = resolveOtherProfileId(senderId);
      const expiresAt = expiresAtForViewMode(viewMode);

      const { data, error } = await insertMessageWithRetry(
        senderId,
        {
          conversation_id: conversationId,
          sender_id: senderId,
          content: caption || null,
          media_url: mediaUrl,
          media_type: 'video',
          message_type: 'video',
          view_mode: viewMode,
          expires_at: expiresAt,
          reply_to_id: replyToId,
          client_message_id: tempId,
        },
        otherProfileId,
      );

      if (error) throw error;
      if (!data) throw new Error('Failed to send video');
      accountGuard();

      updateProgress(100);
      confirmMessage(tempId, data);
      void sendDmBroadcastMessage(conversationId, data as unknown as Record<string, unknown>);

      // Cleanup
      URL.revokeObjectURL(localUrl);
      setVideoUploadProgress(prev => {
        const { [tempId]: _, ...rest } = prev;
        return rest;
      });

      return data;
    } catch (error: any) {
      if (!isCurrentOperation()) { URL.revokeObjectURL(localUrl); throw error; }
      console.error('Failed to send video:', error);
      markFailed(tempId, error.message || 'Failed to send');
      URL.revokeObjectURL(localUrl);
      throw error;
    }
  }, [conversationId, profile?.id, effectiveProfileId, generateTempId, addOptimisticMessage, confirmMessage, markFailed, ensureSendReady, insertMessageWithRetry, resolveOtherProfileId, accountGuard, session, isCurrentOperation]);

  // Retry a failed message
  const retry = useCallback(async (tempId: string) => {
    accountGuard();
    const pending = pendingMessagesRef.current.get(tempId);
    if (!pending) return;

    // Remove the failed message
    removeMessage(tempId);

    // Retry based on message type
    if (pending.mediaUrl && pending.mediaType) {
      return sendMedia(pending.mediaUrl, pending.mediaType, pending.viewMode, pending.replyToId);
    } else if (pending.content) {
      return sendText(pending.content, pending.viewMode, pending.replyToId);
    }
  }, [removeMessage, sendMedia, sendText, accountGuard]);

  return {
    sendText,
    sendMedia,
    sendVideo,
    retry,
    removeMessage,
    videoUploadProgress,
    getPendingMessages: () => isCurrentOperation() ? Array.from(pendingMessagesRef.current.values()) : [],
  };
}

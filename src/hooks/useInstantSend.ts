import { useCallback, useRef, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { Message, ViewMode } from './useMessages';
import { registerOptimisticMessage } from './useGlobalRealtimeMessages';
import { resolveSessionProfileId } from '@/lib/resolveSessionProfileId';
import {
  inferOtherParticipantId,
  isConversationMessagesReady,
  repairConversationForSend,
} from '@/lib/dmMembershipRepair';
import { patchMessagesCache, replaceOptimisticMessage } from '@/lib/messagesQueryKey';
import { syncUserAuthIndex } from '@/lib/firebase/profileResolve';
import { firebaseAuth } from '@/lib/firebase/authService';
import { withTimeout } from '@/lib/withTimeout';
import { toast } from 'sonner';
import { inferOtherUserIdFromConversation } from '@/lib/dmMemberResolve';
import { patchDmConversationActivity, sortDmConversations } from '@/lib/dmConversationSort';
import { findInQueryArray, safeDmMembers } from '@/lib/persistedCollections';
import {
  bumpConversationUpdatedAt,
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
  const { profile } = useAuth();
  const profileId = useAuthProfileId();
  const effectiveProfileId = profileId ?? profile?.id;
  const queryClient = useQueryClient();
  
  const pendingMessagesRef = useRef<Map<string, PendingMessage>>(new Map());
  const sendReadyRef = useRef<{ conversationId?: string; senderId?: string; inflight?: Promise<string> }>({});
  const [videoUploadProgress, setVideoUploadProgress] = useState<Record<string, number>>({});

  useEffect(() => {
    prewarmDmBroadcastChannel(conversationId);
  }, [conversationId]);

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
    if (!conversationId || !effectiveProfileId) return false;

    const senderId = senderIdOverride || effectiveProfileId;

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
    });

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
      queryClient.setQueryData<any[]>(['conversations', effectiveProfileId], updateConversationList);
      queryClient.setQueryData<any[]>(['dm-conversations', effectiveProfileId], updateConversationList);
    }

    return true;
  }, [conversationId, effectiveProfileId, profile, queryClient]);

  const confirmMessage = useCallback((tempId: string, realMessage: Message) => {
    if (!conversationId) return;
    replaceOptimisticMessage(queryClient, conversationId, tempId, realMessage);
    pendingMessagesRef.current.delete(tempId);
  }, [conversationId, queryClient]);

  // Mark message as failed
  const markFailed = useCallback((tempId: string, error: string) => {
    if (!conversationId || !effectiveProfileId) return;

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
    });

    if (pending) {
      pending.status = 'failed';
      pending.error = error;
    }
  }, [conversationId, effectiveProfileId, profile, queryClient]);

  // Remove a message from cache
  const removeMessage = useCallback((tempId: string) => {
    if (!conversationId) return;

    patchMessagesCache(queryClient, conversationId, (old) => {
      if (!old) return old;
      return old.filter(m => m.id !== tempId);
    });

    pendingMessagesRef.current.delete(tempId);
  }, [conversationId, queryClient]);

  const ensureSendReady = useCallback(async (): Promise<string> => {
    if (!conversationId) throw new Error('No conversation');
    const senderId = (await resolveSessionProfileId(profile?.id)) || profile?.id;
    if (!senderId) throw new Error('Not authenticated');

    const { data: { user } } = await firebaseAuth.getUser();
    if (user?.id) {
      await syncUserAuthIndex(user.id, senderId);
    }

    const cachedConv =
      findInQueryArray(queryClient.getQueryData<any[]>(['dm-conversations', senderId]), (c) => c.id === conversationId) ??
      findInQueryArray(queryClient.getQueryData<any[]>(['conversations', senderId]), (c) => c.id === conversationId);
    const otherFromMembers =
      safeDmMembers(cachedConv?.members).find((m: { user_id?: string }) => m.user_id !== senderId)?.user_id;
    const otherProfileId =
      (cachedConv &&
        inferOtherUserIdFromConversation(cachedConv, senderId, profile?.user_id)) ||
      otherFromMembers ||
      inferOtherParticipantId(conversationId, senderId) ||
      null;

    await withTimeout(
      repairConversationForSend(conversationId, senderId, otherProfileId),
      4_000,
      'Chat setup timed out',
    ).catch((err) => {
      console.warn('[InstantSend] repair before send:', err);
    });

    // Don't hard-block — insert retries repair on permission-denied. Blocking here
    // surfaced "Message failed to send" when membership was still propagating.
    if (!isConversationMessagesReady(conversationId, senderId)) {
      console.warn('[InstantSend] membership not verified yet; attempting send with inline repair');
    }

    sendReadyRef.current = { conversationId, senderId };
    return senderId;
  }, [conversationId, profile?.id, profile?.user_id, profileId, queryClient]);

  const resolveOtherProfileId = useCallback(
    (senderId: string) => {
      const cachedConv =
        findInQueryArray(queryClient.getQueryData<any[]>(['dm-conversations', senderId]), (c) => c.id === conversationId) ??
        findInQueryArray(queryClient.getQueryData<any[]>(['conversations', senderId]), (c) => c.id === conversationId);
      const authUid = profile?.user_id ?? null;
      return (
        (cachedConv &&
          inferOtherUserIdFromConversation(cachedConv, senderId, authUid)) ||
        inferOtherParticipantId(conversationId!, senderId) ||
        null
      );
    },
    [conversationId, profile?.user_id, queryClient],
  );

  const resolveSenderIdForSend = useCallback(async (): Promise<string> => {
    if (
      sendReadyRef.current.conversationId === conversationId &&
      sendReadyRef.current.senderId
    ) {
      return sendReadyRef.current.senderId;
    }
    if (effectiveProfileId) {
      sendReadyRef.current = { conversationId, senderId: effectiveProfileId };
      void ensureSendReady().catch(() => {});
      return effectiveProfileId;
    }
    return ensureSendReady();
  }, [conversationId, effectiveProfileId, ensureSendReady]);

  // Pre-warm sender id in background — never block chat open on full repair.
  useEffect(() => {
    if (!conversationId || !effectiveProfileId) return;
    sendReadyRef.current = { conversationId, senderId: effectiveProfileId };
    void ensureSendReady()
      .then((id) => {
        sendReadyRef.current = { conversationId, senderId: id };
      })
      .catch(() => {});
  }, [conversationId, effectiveProfileId, ensureSendReady]);

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
          otherProfileId,
          push: { senderName, preview },
        },
      );
    },
    [profile?.display_name, profile?.username],
  );

  // Send a text message instantly
  const sendText = useCallback(async (
    content: string, 
    viewMode: ViewMode = 'permanent',
    replyToId?: string,
    onOptimisticAdded?: () => void,
  ) => {
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
      };

      const insertPromise = insertMessageWithRetry(
        senderId,
        insertPayload,
        otherProfileId,
      );

      void bumpConversationUpdatedAt(conversationId);

      const { data, error } = await insertPromise;

      if (error) throw error;
      if (!data) throw new Error('Failed to send message');

      confirmMessage(tempId, data);
      void sendDmBroadcastMessage(conversationId, data as unknown as Record<string, unknown>);

    } catch (error: any) {
      if (isTransientSendError(error) && conversationId && effectiveProfileId) {
        const pending = pendingMessagesRef.current.get(tempId);
        void outboxEnqueue({
          tempId,
          conversationId,
          senderId: effectiveProfileId,
          content: pending?.content,
          viewMode: pending?.viewMode || viewMode,
          replyToId: pending?.replyToId,
          expiresAt: expiresAtForViewMode(viewMode),
        });
        toast.info('Message queued — will send when you\'re back online', { duration: 3500 });
        return;
      }
      console.error('Failed to send message:', error);
      markFailed(tempId, error.message || 'Failed to send');
      toast.error('Message failed to send');
    }
    })();
  }, [conversationId, profile?.id, effectiveProfileId, generateTempId, addOptimisticMessage, confirmMessage, markFailed, resolveSenderIdForSend, insertMessageWithRetry, resolveOtherProfileId]);

  // Send media message
  const sendMedia = useCallback(async (
    mediaUrl: string,
    mediaType: string,
    viewMode: ViewMode = 'permanent',
    replyToId?: string
  ) => {
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
        },
        otherProfileId,
      );

      if (error) throw error;
      if (!data) throw new Error('Failed to send media');

      confirmMessage(tempId, data);
      void sendDmBroadcastMessage(conversationId, data as unknown as Record<string, unknown>);
      void bumpConversationUpdatedAt(conversationId);

      return data;
    } catch (error: any) {
      console.error('Failed to send media:', error);
      markFailed(tempId, error.message || 'Failed to send');
      throw error;
    }
  }, [conversationId, profile?.id, effectiveProfileId, generateTempId, addOptimisticMessage, confirmMessage, markFailed, resolveSenderIdForSend, insertMessageWithRetry]);

  // Send video with optimistic UI and progress tracking
  const sendVideo = useCallback(async (
    file: File,
    thumbnail: string,
    duration: number,
    viewMode: ViewMode = 'permanent',
    replyToId?: string,
    caption?: string
  ) => {
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
        setVideoUploadProgress(prev => ({ ...prev, [tempId]: p }));
        const pending = pendingMessagesRef.current.get(tempId);
        if (pending) {
          pending.uploadProgress = p;
        }
      };

      updateProgress(10);

      // Upload to Supabase storage - MUST use profile.user_id (auth ID) for RLS
      if (!profile.user_id) {
        throw new Error('Account not ready - please refresh and try again');
      }
      const fileExt = file.name.split('.').pop() || 'mp4';
      const fileName = `${profile.user_id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      
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
        },
        otherProfileId,
      );

      if (error) throw error;
      if (!data) throw new Error('Failed to send video');

      updateProgress(100);
      confirmMessage(tempId, data);
      void sendDmBroadcastMessage(conversationId, data as unknown as Record<string, unknown>);
      void bumpConversationUpdatedAt(conversationId);

      // Cleanup
      URL.revokeObjectURL(localUrl);
      setVideoUploadProgress(prev => {
        const { [tempId]: _, ...rest } = prev;
        return rest;
      });

      return data;
    } catch (error: any) {
      console.error('Failed to send video:', error);
      markFailed(tempId, error.message || 'Failed to send');
      URL.revokeObjectURL(localUrl);
      throw error;
    }
  }, [conversationId, profile?.id, effectiveProfileId, generateTempId, addOptimisticMessage, confirmMessage, markFailed, resolveSenderIdForSend]);

  // Retry a failed message
  const retry = useCallback(async (tempId: string) => {
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
  }, [removeMessage, sendMedia, sendText]);

  return {
    sendText,
    sendMedia,
    sendVideo,
    retry,
    removeMessage,
    videoUploadProgress,
    getPendingMessages: () => Array.from(pendingMessagesRef.current.values()),
  };
}

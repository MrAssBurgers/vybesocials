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
  resetMessagesReady,
} from '@/lib/dmMembershipRepair';
import { messagesQueryKey, patchMessagesCache } from '@/lib/messagesQueryKey';
import { syncUserAuthIndex } from '@/lib/firebase/profileResolve';
import { firebaseAuth } from '@/lib/firebase/authService';
import { withTimeout } from '@/lib/withTimeout';
import { toast } from 'sonner';
import { inferOtherUserIdFromConversation } from '@/lib/dmMemberResolve';
import { sendDmViaCloudFunction, isRetryableSendError } from '@/lib/firebase/dmSendClient';
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
  const addOptimisticMessage = useCallback((tempId: string, message: Partial<Message>) => {
    if (!conversationId || !effectiveProfileId) return false;

    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: effectiveProfileId,
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
        id: effectiveProfileId,
        username: profile?.username || '',
        avatar_url: profile?.avatar_url || null,
        display_name: (profile as any)?.display_name || profile?.username || null,
      },
      views: [],
      reactions: [],
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
      
      return old.map(conv => {
        if (conv.id === conversationId) {
          return {
            ...conv,
            last_message: {
              content: message.content,
              media_type: message.media_type,
              created_at: optimisticMessage.created_at,
              sender_id: effectiveProfileId,
            },
            updated_at: optimisticMessage.created_at,
            _sortTime: optimisticMessage.created_at,
          };
        }
        return conv;
      }).sort((a, b) => {
        const timeA = new Date(a._sortTime || a.updated_at).getTime();
        const timeB = new Date(b._sortTime || b.updated_at).getTime();
        return timeB - timeA;
      });
    };

    // Update BOTH conversation query keys immediately for instant sync
    if (effectiveProfileId) {
      queryClient.setQueryData<any[]>(['conversations', effectiveProfileId], updateConversationList);
      queryClient.setQueryData<any[]>(['dm-conversations', effectiveProfileId], updateConversationList);
    }

    return true;
  }, [conversationId, effectiveProfileId, profile, queryClient]);

  // Replace temp message with real one from server. If the temp was wiped by a
  // background refetch (rare race), append the real message instead of dropping
  // it — that race used to make the sender's bubble visibly disappear.
  const confirmMessage = useCallback((tempId: string, realMessage: Message) => {
    if (!conversationId) return;

    patchMessagesCache(queryClient, conversationId, (old) => {
      const tempRow = old?.find((m) => m.id === tempId);
      const realWithSender = realMessage.sender
        ? realMessage
        : tempRow?.sender
          ? { ...realMessage, sender: tempRow.sender }
          : realMessage;

      if (!old || old.length === 0) return [realWithSender];

      const realAlreadyPresent = old.some(m => m.id === realWithSender.id);
      const tempPresent = old.some(m => m.id === tempId);

      if (realAlreadyPresent) {
        return tempPresent
          ? old.filter(m => m.id !== tempId).map(m =>
              m.id === realWithSender.id ? { ...m, ...realWithSender, sender: m.sender || realWithSender.sender } : m,
            )
          : old;
      }

      if (tempPresent) {
        return old.map(m => (m.id === tempId ? realWithSender : m));
      }

      return [...old, realWithSender];
    });

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
      queryClient.getQueryData<any[]>(['dm-conversations', senderId])?.find(
        (c) => c.id === conversationId,
      ) ??
      queryClient.getQueryData<any[]>(['conversations', senderId])?.find(
        (c) => c.id === conversationId,
      );
    const otherFromMembers =
      cachedConv?.members?.find((m: { user_id?: string }) => m.user_id !== senderId)?.user_id;
    const otherProfileId =
      (cachedConv &&
        inferOtherUserIdFromConversation(cachedConv, senderId, profile?.user_id)) ||
      otherFromMembers ||
      inferOtherParticipantId(conversationId, senderId) ||
      null;

    await withTimeout(
      repairConversationForSend(conversationId, senderId, otherProfileId),
      12_000,
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

  const repairAndSend = useCallback(
    async (senderId: string, otherProfileId: string | null) => {
      resetMessagesReady(conversationId!, senderId);
      try {
        await withTimeout(
          repairConversationForSend(conversationId!, senderId, otherProfileId, { force: true }),
          12_000,
          'Send setup timed out',
        );
      } catch (err) {
        console.warn('[InstantSend] inline repair failed:', err);
      }
      sendReadyRef.current = { conversationId, senderId };
      return senderId;
    },
    [conversationId],
  );

  const resolveOtherProfileId = useCallback(
    (senderId: string) => {
      const cachedConv =
        queryClient.getQueryData<any[]>(['dm-conversations', senderId])?.find(
          (c) => c.id === conversationId,
        ) ??
        queryClient.getQueryData<any[]>(['conversations', senderId])?.find(
          (c) => c.id === conversationId,
        );
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
    if (sendReadyRef.current.conversationId === conversationId && sendReadyRef.current.inflight) {
      return sendReadyRef.current.inflight;
    }
    return ensureSendReady();
  }, [conversationId, ensureSendReady]);

  // Pre-warm membership while the chat is open (background — never blocks Send tap).
  useEffect(() => {
    if (!conversationId || !effectiveProfileId) return;
    sendReadyRef.current = {
      conversationId,
      inflight: ensureSendReady().then((id) => {
        sendReadyRef.current = { conversationId, senderId: id };
        return id;
      }),
    };
  }, [conversationId, effectiveProfileId, ensureSendReady]);

  const insertMessageWithRetry = useCallback(
    async (
      senderId: string,
      payload: Record<string, unknown>,
      otherProfileId: string | null,
    ) => {
      let activeSenderId = senderId;

      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await db
          .from('messages')
          .insert({ ...payload, sender_id: activeSenderId })
          .select(`
            *,
            sender:profiles!sender_id(id, username, avatar_url, display_name)
          `)
          .single();

        if (!result.error) return result;

        if (!isRetryableSendError(result.error) || attempt === 2) {
          // Server-side send bypasses client rule edge cases (legacy chats, membership lag).
          const cloud = await sendDmViaCloudFunction({
            conversationId: payload.conversation_id as string,
            content: payload.content as string | undefined,
            viewMode: (payload.view_mode as ViewMode) || 'permanent',
            replyToId: (payload.reply_to_id as string | null) ?? null,
            mediaUrl: (payload.media_url as string | null) ?? null,
            mediaType: (payload.media_type as string | null) ?? null,
            messageType: payload.message_type as string | undefined,
          });
          if (!cloud.error && cloud.data) {
            return { data: cloud.data, error: null };
          }
          return result;
        }

        activeSenderId = await repairAndSend(activeSenderId, otherProfileId);
        await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      }

      return { data: null, error: { message: 'Failed to send message' } };
    },
    [repairAndSend],
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

    // Add to UI immediately AND register with the global realtime dedupe so
    // the postgres_changes echo of our own insert can't accidentally remove
    // or duplicate the bubble we just rendered.
    const added = addOptimisticMessage(tempId, { content, view_mode: viewMode, reply_to_id: replyToId });
    if (!added) {
      pendingMessagesRef.current.delete(tempId);
      throw new Error('Could not show message — try again.');
    }
    registerOptimisticMessage(conversationId, content, effectiveProfileId || profile.id);
    onOptimisticAdded?.();

    try {
      const senderId = await resolveSenderIdForSend();
      const otherProfileId = resolveOtherProfileId(senderId);

      const expiresAt = viewMode === '24h' 
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        : null;

      const insertPayload = {
        conversation_id: conversationId,
        sender_id: senderId,
        content,
        message_type: 'text',
        view_mode: viewMode,
        expires_at: expiresAt,
        reply_to_id: replyToId,
      };

      const { data, error } = await insertMessageWithRetry(
        senderId,
        insertPayload,
        otherProfileId,
      );

      if (error) throw error;

      // Replace temp with real message
      const messageWithViewMode = { ...data, view_mode: data.view_mode as ViewMode, views: [], reactions: [] };
      confirmMessage(tempId, messageWithViewMode);

      void sendDmBroadcastMessage(conversationId, messageWithViewMode as unknown as Record<string, unknown>);

      // Update conversation timestamp
      await db
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .then(() => {})
        .catch(() => {});

      return data;
    } catch (error: any) {
      console.error('Failed to send message:', error);
      markFailed(tempId, error.message || 'Failed to send');
      toast.error('Message failed to send');
      throw error;
    }
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
      const expiresAt = viewMode === '24h' 
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        : null;

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

      const messageWithViewMode = { ...data, view_mode: data.view_mode as ViewMode, views: [], reactions: [] };
      confirmMessage(tempId, messageWithViewMode);

      void sendDmBroadcastMessage(conversationId, messageWithViewMode as unknown as Record<string, unknown>);

      await db
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .then(() => {})
        .catch(() => {});

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

      // Calculate expiry
      const expiresAt = viewMode === '24h' 
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        : null;

      // Insert message
      const { data, error } = await db
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: senderId,
          content: caption || null,
          media_url: mediaUrl,
          media_type: 'video',
          message_type: 'video',
          view_mode: viewMode,
          expires_at: expiresAt,
          reply_to_id: replyToId,
        })
        .select(`
          *,
          sender:profiles!sender_id(id, username, avatar_url, display_name)
        `)
        .single();

      if (error) throw error;

      updateProgress(100);

      // Replace temp with real message
      const messageWithViewMode = { ...data, view_mode: data.view_mode as ViewMode, views: [], reactions: [] };
      confirmMessage(tempId, messageWithViewMode);
      void sendDmBroadcastMessage(conversationId, messageWithViewMode as unknown as Record<string, unknown>);

      // Update conversation timestamp
      await db
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .then(() => {})
        .catch(() => {});

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

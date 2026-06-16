import { useCallback, useRef, useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { Message, ViewMode } from './useMessages';
import { registerOptimisticMessage } from './useGlobalRealtimeMessages';
import { toast } from 'sonner';

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
  const queryClient = useQueryClient();
  
  const pendingMessagesRef = useRef<Map<string, PendingMessage>>(new Map());
  const [videoUploadProgress, setVideoUploadProgress] = useState<Record<string, number>>({});

  // Long-lived broadcast channel for instant delivery to receivers viewing this convo.
  // Created lazily and kept subscribed; throwaway channels never finish joining
  // before `.send()` is called, so broadcasts get silently dropped.
  const broadcastChannelRef = useRef<ReturnType<typeof db.channel> | null>(null);
  const broadcastConvoIdRef = useRef<string | undefined>(undefined);

  const getBroadcastChannel = useCallback(() => {
    if (!conversationId) return null;
    if (broadcastChannelRef.current && broadcastConvoIdRef.current === conversationId) {
      return broadcastChannelRef.current;
    }
    // Conversation changed — tear down old channel
    if (broadcastChannelRef.current) {
      try { db.removeChannel(broadcastChannelRef.current); } catch { /* noop */ }
      broadcastChannelRef.current = null;
    }
    const ch = db
      .channel(`dm-broadcast:${conversationId}`, {
        config: { broadcast: { ack: false, self: false } },
      })
      .subscribe((status) => {
        if (import.meta.env.DEV) {
          console.log('[InstantSend] broadcast channel status:', status, conversationId);
        }
      });
    broadcastChannelRef.current = ch;
    broadcastConvoIdRef.current = conversationId;
    return ch;
  }, [conversationId]);

  // Clean up when convo changes or component unmounts
  useEffect(() => {
    return () => {
      if (broadcastChannelRef.current) {
        try { db.removeChannel(broadcastChannelRef.current); } catch { /* noop */ }
        broadcastChannelRef.current = null;
        broadcastConvoIdRef.current = undefined;
      }
    };
  }, [conversationId]);

  // Generate a temporary ID for optimistic updates
  const generateTempId = useCallback(() => {
    return `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }, []);

  // Add message to cache optimistically
  const addOptimisticMessage = useCallback((tempId: string, message: Partial<Message>) => {
    if (!conversationId || !profile) return;

    const optimisticMessage: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: profile.id,
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
        id: profile.id,
        username: profile.username || '',
        avatar_url: profile.avatar_url || null,
        display_name: (profile as any).display_name || profile.username || null,
      },
      views: [],
      reactions: [],
    };

    // Add to messages cache immediately
    queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
      if (!old) return [optimisticMessage];
      return [...old, optimisticMessage];
    });

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
              sender_id: profile.id,
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
    queryClient.setQueryData<any[]>(['conversations', profile.id], updateConversationList);
    queryClient.setQueryData<any[]>(['dm-conversations', profile.id], updateConversationList);

    return tempId;
  }, [conversationId, profile, queryClient]);

  // Replace temp message with real one from server. If the temp was wiped by a
  // background refetch (rare race), append the real message instead of dropping
  // it — that race used to make the sender's bubble visibly disappear.
  const confirmMessage = useCallback((tempId: string, realMessage: Message) => {
    if (!conversationId) return;

    queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
      if (!old || old.length === 0) return [realMessage];

      const realAlreadyPresent = old.some(m => m.id === realMessage.id);
      const tempPresent = old.some(m => m.id === tempId);

      if (realAlreadyPresent) {
        // Drop the temp (if any) — realtime delivered it first.
        return tempPresent ? old.filter(m => m.id !== tempId) : old;
      }

      if (tempPresent) {
        return old.map(m => (m.id === tempId ? realMessage : m));
      }

      // Temp was wiped by a refetch and realtime hasn't filled it in yet —
      // append the confirmed message so the sender always sees it.
      return [...old, realMessage];
    });

    pendingMessagesRef.current.delete(tempId);
  }, [conversationId, queryClient]);

  // Mark message as failed
  const markFailed = useCallback((tempId: string, error: string) => {
    if (!conversationId) return;

    queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
      if (!old) return old;
      
      return old.map(m => {
        if (m.id === tempId) {
          return { ...m, _failed: true, _error: error } as any;
        }
        return m;
      });
    });

    const pending = pendingMessagesRef.current.get(tempId);
    if (pending) {
      pending.status = 'failed';
      pending.error = error;
    }
  }, [conversationId, queryClient]);

  // Remove a message from cache
  const removeMessage = useCallback((tempId: string) => {
    if (!conversationId) return;

    queryClient.setQueryData<Message[]>(['messages', conversationId], (old) => {
      if (!old) return old;
      return old.filter(m => m.id !== tempId);
    });

    pendingMessagesRef.current.delete(tempId);
  }, [conversationId, queryClient]);

  // Send a text message instantly
  const sendText = useCallback(async (
    content: string, 
    viewMode: ViewMode = 'permanent',
    replyToId?: string
  ) => {
    if (!conversationId || !profile?.id || !content.trim()) return;

    const tempId = generateTempId();
    
    // Track pending message
    pendingMessagesRef.current.set(tempId, {
      tempId,
      content,
      viewMode,
      replyToId,
      status: 'sending',
      createdAt: new Date().toISOString(),
    });

    // Add to UI immediately AND register with the global realtime dedupe so
    // the postgres_changes echo of our own insert can't accidentally remove
    // or duplicate the bubble we just rendered.
    addOptimisticMessage(tempId, { content, view_mode: viewMode, reply_to_id: replyToId });
    registerOptimisticMessage(conversationId, content, profile.id);

    try {
      const expiresAt = viewMode === '24h' 
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        : null;

      const { data, error } = await db
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: profile.id,
          content,
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

      // Replace temp with real message
      const messageWithViewMode = { ...data, view_mode: data.view_mode as ViewMode, views: [], reactions: [] };
      confirmMessage(tempId, messageWithViewMode);

      // Broadcast for instant delivery to receiver (long-lived subscribed channel)
      try {
        const bc = getBroadcastChannel();
        await bc?.send({ type: 'broadcast', event: 'new-message', payload: { message: messageWithViewMode } });
      } catch { /* best-effort */ }

      // Update conversation timestamp
      await db
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      return data;
    } catch (error: any) {
      console.error('Failed to send message:', error);
      markFailed(tempId, error.message || 'Failed to send');
      toast.error('Message failed to send');
      throw error;
    }
  }, [conversationId, profile?.id, generateTempId, addOptimisticMessage, confirmMessage, markFailed, getBroadcastChannel]);

  // Send media message
  const sendMedia = useCallback(async (
    mediaUrl: string,
    mediaType: string,
    viewMode: ViewMode = 'permanent',
    replyToId?: string
  ) => {
    if (!conversationId || !profile?.id) return;

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
      const expiresAt = viewMode === '24h' 
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        : null;

      const { data, error } = await db
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: profile.id,
          media_url: mediaUrl,
          media_type: mediaType,
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

      const messageWithViewMode = { ...data, view_mode: data.view_mode as ViewMode, views: [], reactions: [] };
      confirmMessage(tempId, messageWithViewMode);

      // Broadcast for instant delivery (long-lived subscribed channel)
      try {
        const bc = getBroadcastChannel();
        await bc?.send({ type: 'broadcast', event: 'new-message', payload: { message: messageWithViewMode } });
      } catch { /* best-effort */ }

      await db
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      return data;
    } catch (error: any) {
      console.error('Failed to send media:', error);
      markFailed(tempId, error.message || 'Failed to send');
      throw error;
    }
  }, [conversationId, profile?.id, generateTempId, addOptimisticMessage, confirmMessage, markFailed, getBroadcastChannel]);

  // Send video with optimistic UI and progress tracking
  const sendVideo = useCallback(async (
    file: File,
    thumbnail: string,
    duration: number,
    viewMode: ViewMode = 'permanent',
    replyToId?: string,
    caption?: string
  ) => {
    if (!conversationId || !profile?.id) return;

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

      // Calculate expiry
      const expiresAt = viewMode === '24h' 
        ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        : null;

      // Insert message
      const { data, error } = await db
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: profile.id,
          content: caption || null,
          media_url: mediaUrl,
          media_type: 'video',
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

      // Update conversation timestamp
      await db
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

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
  }, [conversationId, profile?.id, generateTempId, addOptimisticMessage, confirmMessage, markFailed, getBroadcastChannel]);

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

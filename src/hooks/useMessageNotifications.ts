import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { premiumSounds } from '@/lib/premiumSounds';
import { navigationRef } from '@/lib/navigationRef';
import { showMessageNotification } from '@/components/notifications/MessageNotificationToast';

/**
 * VYBE v1.1 - Perfect Message Notifications
 * 
 * Features:
 * - Instant delivery on message insert
 * - Clear on read everywhere
 * - Accurate badge counts
 * - Cross-device sync via realtime
 * - No phantom notifications
 */

// Show native browser notification for new messages
async function showNativeNotification(
  senderName: string, 
  body: string, 
  conversationId?: string,
  isGroup?: boolean,
  groupName?: string
) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  
  // Try to use service worker for better notification handling
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    try {
      const registration = await navigator.serviceWorker.ready;
      // Use type assertion for extended notification options supported by service workers
      const options: NotificationOptions & { renotify?: boolean; vibrate?: number[]; data?: unknown } = {
        body,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        tag: `vybe-dm-${conversationId || 'message'}`,
        data: {
          url: conversationId ? `/messages/${conversationId}` : '/messages',
          type: isGroup ? 'group_message' : 'dm',
          conversationId,
        },
      };
      await registration.showNotification(isGroup ? (groupName || 'Group') : senderName, options);
      return;
    } catch (err) {
      console.warn('[Notifications] SW notification failed, falling back:', err);
    }
  }
  
  // Fallback to standard Notification API
  const notification = new Notification(isGroup ? (groupName || 'Group') : senderName, {
    body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: `dm-${conversationId || 'message'}`,
  });

  notification.onclick = () => {
    window.focus();
    if (conversationId) {
      if (navigationRef.current) {
        navigationRef.current(`/messages/${conversationId}`);
      } else {
        window.location.href = `/messages/${conversationId}`;
      }
    }
    notification.close();
  };
}

// Hook for instant message notifications
export function useMessageNotifications() {
  const { profile } = useAuth();
  const profileId = useAuthProfileId();
  const queryClient = useQueryClient();
  const processedMessagesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!profileId) return;

    const channel = subscribePostgresChannel('instant-dm-notifications', [
      {
        event: 'INSERT',
        table: 'messages',
        callback: async (payload) => {
          const newMessage = payload.new as any;
          
          // Skip our own messages
          if (newMessage.sender_id === profileId) return;
          
          // Skip if already processed (prevent duplicates)
          if (processedMessagesRef.current.has(newMessage.id)) return;
          processedMessagesRef.current.add(newMessage.id);
          
          // Keep set size manageable
          if (processedMessagesRef.current.size > 100) {
            const arr = Array.from(processedMessagesRef.current);
            processedMessagesRef.current = new Set(arr.slice(-50));
          }
          
          // Check if user is member of this conversation
          const { data: membership } = await db
            .from('conversation_members')
            .select('user_id')
            .eq('conversation_id', newMessage.conversation_id)
            .eq('user_id', profileId)
            .maybeSingle();
          
          if (!membership) return;
          
          // Fetch sender info
          const { data: sender } = await db
            .from('profiles')
            .select('username, avatar_url, display_name')
            .eq('id', newMessage.sender_id)
            .single();
          
          const senderName = sender?.display_name || sender?.username || 'Someone';
          const messagePreview = newMessage.media_type 
            ? (newMessage.media_type === 'image' ? '📷 Photo' : 
               newMessage.media_type === 'vybe' ? '📸 Vybe' :
               newMessage.media_type === 'voice' ? '🎤 Voice message' :
               newMessage.media_type === 'video' ? '🎬 Video' : '📎 Media')
            : (newMessage.content?.slice(0, 50) || 'New message');
          
          // Check if currently viewing this conversation
          const currentConvo = window.location.pathname.match(/\/messages\/([a-f0-9-]+)/)?.[1];
          const isViewingConvo = currentConvo === newMessage.conversation_id;
          const isDocumentVisible = document.visibilityState === 'visible';
          
          // Debounce query invalidation to prevent rapid updates
          // Only invalidate if not already invalidating
          
          // Fetch conversation info to check if group
          const { data: conversation } = await db
            .from('conversations')
            .select('is_group, name')
            .eq('id', newMessage.conversation_id)
            .single();
          
          const isGroup = conversation?.is_group || false;
          const groupName = conversation?.name || undefined;
          
          // If not viewing this conversation, show notifications
          if (!isViewingConvo || !isDocumentVisible) {
            // Play satisfying notification sound
            premiumSounds.notification();
            
            // Store conversation ID for navigation
            const conversationId = newMessage.conversation_id;
            
            // Show custom notification with full message payload for hold menu
            showMessageNotification(
              newMessage.sender_id,
              senderName,
              sender?.avatar_url || null,
              messagePreview,
              conversationId,
              newMessage.id,
              newMessage.content || null,
              newMessage.media_url || null,
              newMessage.media_type || null,
            );
            
            // Show native notification if page hidden or not focused
            if (document.hidden || !document.hasFocus()) {
              showNativeNotification(
                senderName, 
                messagePreview, 
                conversationId,
                isGroup,
                groupName
              );
              
              // Also trigger server-side push for other devices
              // Note: This is for the current user's OTHER devices, not the sender
              // The actual push to other users is handled by database triggers
            }
            
            // Only invalidate the badge count; the DM list is already patched by global realtime
            queryClient.invalidateQueries({ queryKey: ['unread-messages-count', profileId] });
          }
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [profileId, queryClient]);
}

// Hook to instantly mark conversation as read and clear badges
export function useInstantReadClear(conversationId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const hasMarkedReadRef = useRef<string | null>(null);

  const markAsRead = useCallback(async () => {
    if (!conversationId || !profile?.id) return;
    if (hasMarkedReadRef.current === conversationId) return;
    
    hasMarkedReadRef.current = conversationId;
    
    const markReadPatch = (old: any[] | undefined) => {
      if (!old) return old;
      return old.map((conv) =>
        conv.id === conversationId
          ? { ...conv, unread_count: 0, _hasUnread: false }
          : conv,
      );
    };

    queryClient.setQueryData<any[]>(['dm-conversations', profile.id], markReadPatch);
    queryClient.setQueryData<any[]>(['conversations', profile.id], markReadPatch);
    queryClient.setQueryData<any[]>(['conversations'], markReadPatch);
    
    // Update last_read_at in database
    const now = new Date().toISOString();
    await db
      .from('conversation_members')
      .update({ last_read_at: now })
      .eq('conversation_id', conversationId)
      .eq('user_id', profile.id);
    
    // Optimistically decrement the tab badge count immediately
    queryClient.setQueryData(['unread-messages-count', profile.id], (old: number | undefined) => {
      return Math.max(0, (old || 1) - 1);
    });
    
    queryClient.invalidateQueries({ queryKey: ['unread-messages-count', profile.id] });
  }, [conversationId, profile?.id, queryClient]);

  // Mark as read immediately when conversation opens
  useEffect(() => {
    if (conversationId && profile?.id) {
      markAsRead();
    }
  }, [conversationId, profile?.id, markAsRead]);

  // Re-mark on visibility change (returning to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && conversationId) {
        hasMarkedReadRef.current = null; // Reset to allow re-marking
        markAsRead();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [conversationId, markAsRead]);

  return { markAsRead };
}

// Hook for cross-device read state sync
export function useCrossDeviceSync() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profile?.id) return;

    const channel = subscribePostgresChannel('cross-device-read-sync', [
      {
        event: 'UPDATE',
        table: 'conversation_members',
        filter: `user_id=eq.${profile.id}`,
        callback: (payload) => {
          // Patch caches in place instead of invalidating — invalidations
          // were causing the entire conversation list to refetch and visibly
          // flicker every time the user opened a DM on any device.
          const row: any = payload.new;
          if (!row?.conversation_id) return;

          const patch = (old: any[] | undefined) => {
            if (!old) return old;
            return old.map((c) =>
              c.id === row.conversation_id
                ? { ...c, unread_count: 0, _hasUnread: false }
                : c
            );
          };
          queryClient.setQueryData<any[]>(['dm-conversations', profile.id], patch);
          queryClient.setQueryData<any[]>(['conversations', profile.id], patch);
          // The badge count is cheap to recompute; let it refresh.
          queryClient.invalidateQueries({ queryKey: ['unread-messages-count', profile.id] });
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [profile?.id, queryClient]);
}

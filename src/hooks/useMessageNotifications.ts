import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { premiumSounds } from '@/lib/premiumSounds';
import { showMessageNotification } from '@/components/notifications/MessageNotificationToast';
import { sendPushNotification } from '@/lib/pushNotifications';
import { navigationRef } from '@/lib/navigationRef';

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
  const queryClient = useQueryClient();
  const processedMessagesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!profile?.id) return;

    // Listen for new messages across all conversations
    const channel = supabase
      .channel('instant-dm-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        async (payload) => {
          const newMessage = payload.new as any;
          
          // Skip our own messages
          if (newMessage.sender_id === profile.id) return;
          
          // Skip if already processed (prevent duplicates)
          if (processedMessagesRef.current.has(newMessage.id)) return;
          processedMessagesRef.current.add(newMessage.id);
          
          // Keep set size manageable
          if (processedMessagesRef.current.size > 100) {
            const arr = Array.from(processedMessagesRef.current);
            processedMessagesRef.current = new Set(arr.slice(-50));
          }
          
          // Check if user is member of this conversation
          const { data: membership } = await supabase
            .from('conversation_members')
            .select('user_id')
            .eq('conversation_id', newMessage.conversation_id)
            .eq('user_id', profile.id)
            .maybeSingle();
          
          if (!membership) return;
          
          // Fetch sender info
          const { data: sender } = await supabase
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
          const { data: conversation } = await supabase
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
            
            // Only invalidate when showing notification to update badge
            queryClient.invalidateQueries({ queryKey: ['conversations'] });
            queryClient.invalidateQueries({ queryKey: ['unread-messages-count'] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, queryClient]);
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
    
    // Optimistically update UI immediately - update both query key formats
    queryClient.setQueryData<any[]>(['conversations', profile.id], (old) => {
      if (!old) return old;
      return old.map(conv => {
        if (conv.id === conversationId) {
          return { ...conv, unread_count: 0 };
        }
        return conv;
      });
    });
    
    // Also update the general conversations query
    queryClient.setQueryData<any[]>(['conversations'], (old) => {
      if (!old) return old;
      return old.map(conv => {
        if (conv.id === conversationId) {
          return { ...conv, unread_count: 0 };
        }
        return conv;
      });
    });
    
    // Update last_read_at in database
    const now = new Date().toISOString();
    await supabase
      .from('conversation_members')
      .update({ last_read_at: now })
      .eq('conversation_id', conversationId)
      .eq('user_id', profile.id);
    
    // Optimistically decrement the tab badge count immediately
    queryClient.setQueryData(['unread-messages-count', profile.id], (old: number | undefined) => {
      return Math.max(0, (old || 1) - 1);
    });
    
    // Force immediate invalidation to sync badge count everywhere (with profile.id for correct query key)
    queryClient.invalidateQueries({ queryKey: ['unread-messages-count', profile.id] });
    queryClient.invalidateQueries({ queryKey: ['conversations', profile.id] });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
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

    // Listen for conversation_members updates (read state changes)
    const channel = supabase
      .channel('cross-device-read-sync')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_members',
          filter: `user_id=eq.${profile.id}`,
        },
        () => {
          // Another device marked as read, refresh counts
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          queryClient.invalidateQueries({ queryKey: ['unread-messages-count'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, queryClient]);
}

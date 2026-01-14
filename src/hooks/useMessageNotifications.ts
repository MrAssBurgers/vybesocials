import { useEffect, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { callSounds } from '@/lib/callSounds';
import { toast } from 'sonner';

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
function showNativeNotification(title: string, body: string, conversationId?: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  
  const notification = new Notification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: `dm-${conversationId || 'message'}`, // Unique tag per conversation
  });

  notification.onclick = () => {
    window.focus();
    if (conversationId) {
      window.location.href = `/messages/${conversationId}`;
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
            ? (newMessage.media_type === 'image' ? '📷 Photo' : '🎤 Voice message')
            : (newMessage.content?.slice(0, 50) || 'New message');
          
          // Check if currently viewing this conversation
          const currentConvo = window.location.pathname.match(/\/messages\/([a-f0-9-]+)/)?.[1];
          const isViewingConvo = currentConvo === newMessage.conversation_id;
          const isDocumentVisible = document.visibilityState === 'visible';
          
          // Invalidate queries immediately for badge update
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
          queryClient.invalidateQueries({ queryKey: ['unread-messages-count'] });
          
          // If not viewing this conversation, show notifications
          if (!isViewingConvo || !isDocumentVisible) {
            // Play sound
            callSounds.message();
            
            // Show toast
            toast.info(`${senderName}: ${messagePreview}`, {
              duration: 4000,
              action: {
                label: 'View',
                onClick: () => window.location.href = `/messages/${newMessage.conversation_id}`,
              },
            });
            
            // Show native notification if page hidden
            if (document.hidden) {
              showNativeNotification(senderName, messagePreview, newMessage.conversation_id);
            }
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
    
    // Optimistically update UI immediately
    queryClient.setQueryData<any[]>(['conversations', profile.id], (old) => {
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
    
    // Invalidate to sync across devices
    queryClient.invalidateQueries({ queryKey: ['unread-messages-count'] });
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

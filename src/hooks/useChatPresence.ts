import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

interface PresenceUser {
  user_id: string;
  username: string;
  avatar_url: string | null;
  display_name: string | null;
  is_typing: boolean;
}

export function useChatPresence(conversationId: string | undefined) {
  const { profile } = useAuth();
  const [presentUsers, setPresentUsers] = useState<PresenceUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const typingTimeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Join presence when viewing a chat
  const joinPresence = useCallback(async () => {
    if (!conversationId || !profile?.id) return;

    try {
      await supabase
        .from('chat_presence')
        .upsert(
          {
            conversation_id: conversationId,
            user_id: profile.id,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: 'conversation_id,user_id' }
        );
    } catch (error) {
      console.error('Failed to join presence:', error);
    }
  }, [conversationId, profile?.id]);

  // Leave presence when leaving the chat
  const leavePresence = useCallback(async () => {
    if (!conversationId || !profile?.id) return;

    try {
      await supabase
        .from('chat_presence')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', profile.id);
    } catch (error) {
      console.error('Failed to leave presence:', error);
    }
  }, [conversationId, profile?.id]);

  // Update typing state
  const setTyping = useCallback(async (isTyping: boolean) => {
    if (!conversationId || !profile?.id) return;

    try {
      if (isTyping) {
        await supabase
          .from('typing_indicators')
          .upsert(
            {
              conversation_id: conversationId,
              user_id: profile.id,
              started_at: new Date().toISOString(),
            },
            { onConflict: 'conversation_id,user_id', ignoreDuplicates: false }
          );
      } else {
        await supabase
          .from('typing_indicators')
          .delete()
          .eq('conversation_id', conversationId)
          .eq('user_id', profile.id);
      }
    } catch (error) {
      console.error('Failed to update typing:', error);
    }
  }, [conversationId, profile?.id]);

  // Fetch current presence
  const fetchPresence = useCallback(async () => {
    if (!conversationId || !profile?.id) return;

    try {
      // Get presence data (users viewing this chat in last 30 seconds)
      const thirtySecondsAgo = new Date(Date.now() - 30000).toISOString();
      
      const { data: presenceData } = await supabase
        .from('chat_presence')
        .select(`
          user_id,
          profiles:user_id(id, username, avatar_url, display_name)
        `)
        .eq('conversation_id', conversationId)
        .neq('user_id', profile.id)
        .gt('last_seen_at', thirtySecondsAgo);

      // Get typing indicators (last 5 seconds)
      const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
      const { data: typingData } = await supabase
        .from('typing_indicators')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .neq('user_id', profile.id)
        .gt('started_at', fiveSecondsAgo);

      const typingSet = new Set(typingData?.map(t => t.user_id) || []);
      setTypingUsers(typingSet);

      const users: PresenceUser[] = (presenceData || []).map((p: any) => ({
        user_id: p.user_id,
        username: p.profiles?.username || '',
        avatar_url: p.profiles?.avatar_url,
        display_name: p.profiles?.display_name,
        is_typing: typingSet.has(p.user_id),
      }));

      setPresentUsers(users);
    } catch (error) {
      console.error('Failed to fetch presence:', error);
    }
  }, [conversationId, profile?.id]);

  // Setup presence and subscriptions
  useEffect(() => {
    if (!conversationId || !profile?.id) return;

    // Join presence immediately
    joinPresence();
    fetchPresence();

    // Heartbeat every 10 seconds to keep presence alive
    heartbeatRef.current = setInterval(() => {
      joinPresence();
    }, 10000);

    // Subscribe to presence changes
    const presenceChannel = supabase
      .channel(`presence:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_presence',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          fetchPresence();
        }
      )
      .subscribe();

    // Subscribe to typing changes
    const typingChannel = supabase
      .channel(`typing-presence:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_indicators',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          fetchPresence();
        }
      )
      .subscribe();

    // Cleanup on unmount or conversation change
    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
      }
      leavePresence();
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(typingChannel);
      
      // Clear all typing timeouts
      typingTimeoutRefs.current.forEach(timeout => clearTimeout(timeout));
      typingTimeoutRefs.current.clear();
    };
  }, [conversationId, profile?.id, joinPresence, leavePresence, fetchPresence]);

  // Handle visibility change - leave presence when tab is hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        leavePresence();
      } else {
        joinPresence();
        fetchPresence();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [joinPresence, leavePresence, fetchPresence]);

  return {
    presentUsers,
    typingUsers: Array.from(typingUsers),
    setTyping,
  };
}

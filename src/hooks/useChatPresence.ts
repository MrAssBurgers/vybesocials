import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { PRESENCE } from '@/lib/constants';

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
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const conversationIdRef = useRef(conversationId);
  const profileIdRef = useRef(profile?.id);
  
  // Keep refs updated
  useEffect(() => {
    conversationIdRef.current = conversationId;
    profileIdRef.current = profile?.id;
  }, [conversationId, profile?.id]);

  // Fast typing indicator - instant updates, no debounce for start
  const typingDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingStateRef = useRef<boolean>(false);

  // Fire-and-forget setTyping - never blocks the main thread
  const setTyping = useCallback((isTyping: boolean) => {
    // For typing=true, always update timestamp (don't skip duplicates)
    // For typing=false, skip if already false
    if (!isTyping && lastTypingStateRef.current === false) return;
    lastTypingStateRef.current = isTyping;
    
    const cid = conversationIdRef.current;
    const pid = profileIdRef.current;
    if (!cid || !pid) return;

    // Clear pending debounce
    if (typingDebounceRef.current) {
      clearTimeout(typingDebounceRef.current);
      typingDebounceRef.current = null;
    }

    // Fire-and-forget async operation
    const updateTyping = async () => {
      try {
        if (isTyping) {
          await supabase
            .from('typing_indicators')
            .upsert(
              {
                conversation_id: cid,
                user_id: pid,
                started_at: new Date().toISOString(),
              },
              { onConflict: 'conversation_id,user_id', ignoreDuplicates: false }
            );
        } else {
          await supabase
            .from('typing_indicators')
            .delete()
            .eq('conversation_id', cid)
            .eq('user_id', pid);
        }
      } catch (error) {
        // Silent fail for typing - non-critical
      }
    };
    
    // Execute without blocking - use microtask for typing start, slight delay for stop
    if (isTyping) {
      queueMicrotask(updateTyping);
    } else {
      typingDebounceRef.current = setTimeout(updateTyping, 100);
    }
  }, []);

  // Setup presence and subscriptions
  useEffect(() => {
    if (!conversationId || !profile?.id) return;

    let isMounted = true;
    const profileId = profile.id;

    // Join presence
    const joinPresence = async () => {
      if (!isMounted) return;
      try {
        await supabase
          .from('chat_presence')
          .upsert(
            {
              conversation_id: conversationId,
              user_id: profileId,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: 'conversation_id,user_id' }
          );
      } catch (error) {
        // Silent fail
      }
    };

    // Leave presence
    const leavePresence = async () => {
      try {
        await supabase
          .from('chat_presence')
          .delete()
          .eq('conversation_id', conversationId)
          .eq('user_id', profileId);
      } catch (error) {
        // Silent fail
      }
    };

    // Fetch current presence
    const fetchPresence = async () => {
      if (!isMounted) return;
      try {
        const presenceWindow = new Date(Date.now() - 30000).toISOString();
        
        const { data: presenceData } = await supabase
          .from('chat_presence')
          .select(`
            user_id,
            profiles:user_id(id, username, avatar_url, display_name)
          `)
          .eq('conversation_id', conversationId)
          .neq('user_id', profileId)
          .gt('last_seen_at', presenceWindow);

        const typingWindow = new Date(Date.now() - PRESENCE.TYPING_TIMEOUT_MS).toISOString();
        const { data: typingData } = await supabase
          .from('typing_indicators')
          .select('user_id')
          .eq('conversation_id', conversationId)
          .neq('user_id', profileId)
          .gt('started_at', typingWindow);

        if (!isMounted) return;

        const typingSet = new Set(typingData?.map(t => t.user_id) || []);
        setTypingUsers(Array.from(typingSet));

        const users: PresenceUser[] = (presenceData || []).map((p: any) => ({
          user_id: p.user_id,
          username: p.profiles?.username || '',
          avatar_url: p.profiles?.avatar_url,
          display_name: p.profiles?.display_name,
          is_typing: typingSet.has(p.user_id),
        }));

        setPresentUsers(users);
      } catch (error) {
        // Silent fail
      }
    };

    // Initial setup
    joinPresence();
    fetchPresence();

    // Fast heartbeat every 3 seconds for responsive presence
    heartbeatRef.current = setInterval(joinPresence, 3000);

    // Also poll presence state every 3 seconds as a safety net for missed realtime events
    const presencePollRef = setInterval(fetchPresence, 3000);

    // Subscribe to presence changes
    const presenceChannel = supabase
      .channel(`chat-presence:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_presence',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          if (isMounted) fetchPresence();
        }
      )
      .subscribe();

    // Subscribe to typing changes - handle directly from realtime payload
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
        (payload) => {
          if (!isMounted) return;
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const data = payload.new as any;
            if (data.user_id === profileId) return; // Skip own typing
            
            // Check if recent
            const startedAt = new Date(data.started_at || data.updated_at).getTime();
            const isRecent = Date.now() - startedAt < PRESENCE.TYPING_TIMEOUT_MS;
            
            if (isRecent) {
              setTypingUsers(prev => {
                if (prev.includes(data.user_id)) return prev;
                return [...prev, data.user_id];
              });
              
              // Auto-clear after timeout
              setTimeout(() => {
                if (!isMounted) return;
                setTypingUsers(prev => prev.filter(id => id !== data.user_id));
              }, PRESENCE.TYPING_TIMEOUT_MS);
            }
          } else if (payload.eventType === 'DELETE') {
            const oldData = payload.old as any;
            if (oldData?.user_id && oldData.user_id !== profileId) {
              setTypingUsers(prev => prev.filter(id => id !== oldData.user_id));
            }
          }
        }
      )
      .subscribe();

    // Visibility change handler
    const handleVisibilityChange = () => {
      if (document.hidden) {
        leavePresence();
      } else if (isMounted) {
        joinPresence();
        fetchPresence();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      isMounted = false;
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      clearInterval(presencePollRef);
      leavePresence();
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(typingChannel);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [conversationId, profile?.id]);

  return {
    presentUsers,
    typingUsers,
    setTyping,
  };
}

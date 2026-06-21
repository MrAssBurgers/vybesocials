import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { PRESENCE } from '@/lib/constants';
import { prewarmDmBroadcastChannel, sendDmBroadcastTyping, subscribeDmBroadcastTyping, sendDmBroadcastActivity, subscribeDmBroadcastActivity } from '@/lib/dmBroadcast';

interface PresenceUser {
  user_id: string;
  username: string;
  avatar_url: string | null;
  display_name: string | null;
  is_typing: boolean;
}

export function useChatPresence(conversationId: string | undefined) {
  const { profile, user } = useAuth();
  const profileId = useAuthProfileId();
  const effectiveProfileId = profileId ?? profile?.id;
  const authUid = user?.id ?? profile?.user_id ?? null;
  const [presentUsers, setPresentUsers] = useState<PresenceUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const conversationIdRef = useRef(conversationId);
  const profileIdRef = useRef(effectiveProfileId);
  const authUidRef = useRef(authUid);
  const profileMetaRef = useRef({
    username: profile?.username || '',
    displayName: (profile as { display_name?: string | null })?.display_name || profile?.username || '',
    avatarUrl: profile?.avatar_url || null,
  });
  
  // Keep refs updated
  useEffect(() => {
    conversationIdRef.current = conversationId;
    profileIdRef.current = effectiveProfileId;
    authUidRef.current = authUid;
  profileMetaRef.current = {
    username: profile?.username || '',
    displayName: (profile as { display_name?: string | null })?.display_name || profile?.username || '',
    avatarUrl: profile?.avatar_url || null,
  };
  }, [conversationId, effectiveProfileId, profile?.username, profile, authUid]);

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

    void sendDmBroadcastTyping(cid, {
      userId: pid,
      isTyping,
      username: profileMetaRef.current.username,
      displayName: profileMetaRef.current.displayName,
    });

    // Clear pending debounce
    if (typingDebounceRef.current) {
      clearTimeout(typingDebounceRef.current);
      typingDebounceRef.current = null;
    }

    // Fire-and-forget async operation
    const updateTyping = async () => {
      try {
        if (isTyping) {
          await db
            .from('typing_indicators')
            .upsert(
              {
                id: `${cid}_${pid}`,
                conversation_id: cid,
                user_id: pid,
                started_at: new Date().toISOString(),
              },
              { onConflict: 'conversation_id,user_id', ignoreDuplicates: false }
            );
        } else {
          await db
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
    if (!conversationId || !effectiveProfileId) return;

    let isMounted = true;
    const profileId = effectiveProfileId;
    const presenceDocId = `${conversationId}_${profileId}`;

    // Join presence
    const joinPresence = async () => {
      if (!isMounted) return;
      try {
        await db
          .from('chat_presence')
          .upsert(
            {
              id: presenceDocId,
              conversation_id: conversationId,
              user_id: profileId,
              last_seen_at: new Date().toISOString(),
              activity: 'viewing',
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
        await db
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
        
        const { data: presenceData } = await db
          .from('chat_presence')
          .select('user_id, last_seen_at, activity')
          .eq('conversation_id', conversationId)
          .neq('user_id', profileId)
          .gt('last_seen_at', presenceWindow);

        const typingWindow = new Date(Date.now() - PRESENCE.TYPING_TIMEOUT_MS).toISOString();
        const { data: typingData } = await db
          .from('typing_indicators')
          .select('user_id')
          .eq('conversation_id', conversationId)
          .neq('user_id', profileId)
          .gt('started_at', typingWindow);

        if (!isMounted) return;

        const typingSet = new Set<string>((typingData || []).map((t: any) => String(t.user_id)));
        setTypingUsers(Array.from(typingSet));

        const peerIds = [
          ...new Set(
            (presenceData || []).map((p: { user_id?: string }) => p.user_id).filter(Boolean) as string[],
          ),
        ];
        const profiles = new Map<string, { username?: string; avatar_url?: string | null; display_name?: string | null }>();
        await Promise.all(
          peerIds.map(async (id) => {
            const { data } = await db
              .from('profiles')
              .select('id, username, avatar_url, display_name')
              .eq('id', id)
              .maybeSingle();
            if (data) profiles.set(id, data);
          }),
        );

        const users: PresenceUser[] = (presenceData || []).map((p: any) => ({
          user_id: p.user_id,
          username: profiles.get(p.user_id)?.username || '',
          avatar_url: profiles.get(p.user_id)?.avatar_url ?? null,
          display_name: profiles.get(p.user_id)?.display_name ?? null,
          is_typing: typingSet.has(p.user_id) || p.activity === 'typing',
        }));

        setPresentUsers(users);
      } catch (error) {
        // Silent fail
      }
    };

    // Initial setup — announce viewing + subscribe to peer activity (<100ms via broadcast)
    prewarmDmBroadcastChannel(conversationId);
    void sendDmBroadcastActivity(conversationId, {
      userId: profileId,
      activity: 'viewing',
      username: profileMetaRef.current.username,
      displayName: profileMetaRef.current.displayName,
      avatarUrl: profileMetaRef.current.avatarUrl,
    });
    joinPresence();
    fetchPresence();

    // Fast heartbeat every 2 seconds for responsive presence
    heartbeatRef.current = setInterval(() => {
      joinPresence();
      void sendDmBroadcastActivity(conversationId, {
        userId: profileId,
        activity: 'viewing',
        username: profileMetaRef.current.username,
        displayName: profileMetaRef.current.displayName,
        avatarUrl: profileMetaRef.current.avatarUrl,
      });
    }, 2000);

    // Poll as a safety net for missed realtime events
    const presencePollRef = setInterval(fetchPresence, 2000);

    const unsubscribeActivityBroadcast = subscribeDmBroadcastActivity(conversationId, (payload) => {
      if (!isMounted) return;
      if (payload.userId === profileId || (authUid && payload.userId === authUid)) return;

      if (payload.activity === 'idle') {
        setPresentUsers((prev) => prev.filter((u) => u.user_id !== payload.userId));
        setTypingUsers((prev) => prev.filter((id) => id !== payload.userId));
        return;
      }

      setPresentUsers((prev) => {
        const existing = prev.find((u) => u.user_id === payload.userId);
        const nextUser: PresenceUser = {
          user_id: payload.userId,
          username: payload.username || existing?.username || '',
          avatar_url: payload.avatarUrl ?? existing?.avatar_url ?? null,
          display_name: payload.displayName || payload.username || existing?.display_name || null,
          is_typing: payload.activity === 'typing',
        };
        if (existing) {
          return prev.map((u) => (u.user_id === payload.userId ? nextUser : u));
        }
        return [...prev, nextUser];
      });

      if (payload.activity === 'typing') {
        setTypingUsers((prev) => (prev.includes(payload.userId) ? prev : [...prev, payload.userId]));
      } else {
        setTypingUsers((prev) => prev.filter((id) => id !== payload.userId));
      }
    });

    const unsubscribeTypingBroadcast = subscribeDmBroadcastTyping(conversationId, (payload) => {
      if (!isMounted) return;
      const selfId = profileId;
      if (payload.userId === selfId || (authUid && payload.userId === authUid)) return;

      if (payload.isTyping) {
        setTypingUsers((prev) => (prev.includes(payload.userId) ? prev : [...prev, payload.userId]));
        setPresentUsers((prev) => {
          const existing = prev.find((u) => u.user_id === payload.userId);
          if (existing) {
            return prev.map((u) =>
              u.user_id === payload.userId ? { ...u, is_typing: true } : u,
            );
          }
          return [
            ...prev,
            {
              user_id: payload.userId,
              username: payload.username || '',
              avatar_url: null,
              display_name: payload.displayName || payload.username || null,
              is_typing: true,
            },
          ];
        });
      } else {
        setTypingUsers((prev) => prev.filter((id) => id !== payload.userId));
        setPresentUsers((prev) =>
          prev.map((u) => (u.user_id === payload.userId ? { ...u, is_typing: false } : u)),
        );
      }
    });

    const presenceChannel = subscribePostgresChannel(`chat-presence:${conversationId}`, [
      {
        event: '*',
        table: 'chat_presence',
        filter: `conversation_id=eq.${conversationId}`,
        callback: () => {
          if (isMounted) fetchPresence();
        },
      },
      {
        event: '*',
        table: 'typing_indicators',
        filter: `conversation_id=eq.${conversationId}`,
        callback: (payload) => {
          if (!isMounted) return;
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const data = payload.new as any;
            if (data.user_id === profileId || (authUid && data.user_id === authUid)) return;
            
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
            if (
              oldData?.user_id &&
              oldData.user_id !== profileId &&
              (!authUid || oldData.user_id !== authUid)
            ) {
              setTypingUsers(prev => prev.filter(id => id !== oldData.user_id));
            }
          }
        },
      },
    ]);

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
      unsubscribeActivityBroadcast();
      unsubscribeTypingBroadcast();
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      clearInterval(presencePollRef);
      leavePresence();
      removeRealtimeChannel(presenceChannel);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [conversationId, effectiveProfileId, authUid]);

  return {
    presentUsers,
    typingUsers,
    setTyping,
  };
}

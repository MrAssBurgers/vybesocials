import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { PRESENCE } from '@/lib/constants';

interface TypingUser {
  userId: string;
  conversationId: string;
  timestamp: number;
}

/**
 * Hook that subscribes to typing indicators across all conversations
 * Returns a Map of conversationId -> userId[] of who is typing
 */
export function useConversationTyping(conversationIds: string[]) {
  const { profile } = useAuth();
  const [typingMap, setTypingMap] = useState<Map<string, string[]>>(new Map());

  const TYPING_TIMEOUT = PRESENCE.TYPING_TIMEOUT_MS;
  const trackedConvIdsRef = useRef<Set<string>>(new Set());
  const convIdsKey = [...conversationIds].sort().join(',');

  useEffect(() => {
    trackedConvIdsRef.current = new Set(conversationIds);
  }, [convIdsKey, conversationIds]);

  useEffect(() => {
    if (!profile?.id || !conversationIds.length) {
      setTypingMap(new Map());
      return;
    }

    const tracked = trackedConvIdsRef;

    const channel = subscribePostgresChannel('conversation-typing-global', [
      {
        event: '*',
        table: 'typing_indicators',
        callback: (payload) => {
          const data = payload.new as any;
          const oldData = payload.old as any;
          
          // Only process for conversations we care about
          const convId = data?.conversation_id || oldData?.conversation_id;
          if (!convId || !tracked.current.has(convId)) return;
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            // Someone started/updated typing
            if (data.user_id === profile.id) return; // Skip our own typing
            
            // Check if typing indicator is recent
            const updatedAt = new Date(data.updated_at || data.created_at).getTime();
            const isRecent = Date.now() - updatedAt < TYPING_TIMEOUT;
            
            if (isRecent) {
              setTypingMap(prev => {
                const current = prev.get(convId) || [];
                if (current.includes(data.user_id)) return prev;
                const newMap = new Map(prev);
                newMap.set(convId, [...current, data.user_id]);
                return newMap;
              });
              
              // Auto-remove after timeout
              setTimeout(() => {
                setTypingMap(prev => {
                  const current = prev.get(convId) || [];
                  if (!current.includes(data.user_id)) return prev;
                  const newMap = new Map(prev);
                  const next = current.filter(id => id !== data.user_id);
                  if (next.length === 0) {
                    newMap.delete(convId);
                  } else {
                    newMap.set(convId, next);
                  }
                  return newMap;
                });
              }, TYPING_TIMEOUT);
            }
          } else if (payload.eventType === 'DELETE') {
            // Someone stopped typing
            const userId = oldData?.user_id;
            if (userId && convId) {
              setTypingMap(prev => {
                const current = prev.get(convId) || [];
                if (!current.includes(userId)) return prev;
                const newMap = new Map(prev);
                const next = current.filter(id => id !== userId);
                if (next.length === 0) {
                  newMap.delete(convId);
                } else {
                  newMap.set(convId, next);
                }
                return newMap;
              });
            }
          }
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [profile?.id, convIdsKey]);

  // Check if a specific conversation has anyone typing
  const isTyping = useCallback((conversationId: string) => {
    return (typingMap.get(conversationId)?.length || 0) > 0;
  }, [typingMap]);

  // Get typers for a specific conversation
  const getTypers = useCallback((conversationId: string) => {
    return typingMap.get(conversationId) || [];
  }, [typingMap]);

  return {
    typingMap,
    isTyping,
    getTypers,
  };
}

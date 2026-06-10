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

  useEffect(() => {
    if (!profile?.id || !conversationIds.length) {
      setTypingMap(new Map());
      return;
    }

    const channel = subscribePostgresChannel('conversation-typing-global', [
      {
        event: '*',
        table: 'typing_indicators',
        callback: (payload) => {
          const data = payload.new as any;
          const oldData = payload.old as any;
          
          // Only process for conversations we care about
          const convId = data?.conversation_id || oldData?.conversation_id;
          if (!convId || !conversationIds.includes(convId)) return;
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            // Someone started/updated typing
            if (data.user_id === profile.id) return; // Skip our own typing
            
            // Check if typing indicator is recent
            const updatedAt = new Date(data.updated_at || data.created_at).getTime();
            const isRecent = Date.now() - updatedAt < TYPING_TIMEOUT;
            
            if (isRecent) {
              setTypingMap(prev => {
                const newMap = new Map(prev);
                const current = newMap.get(convId) || [];
                if (!current.includes(data.user_id)) {
                  newMap.set(convId, [...current, data.user_id]);
                }
                return newMap;
              });
              
              // Auto-remove after timeout
              setTimeout(() => {
                setTypingMap(prev => {
                  const newMap = new Map(prev);
                  const current = newMap.get(convId) || [];
                  newMap.set(convId, current.filter(id => id !== data.user_id));
                  if (newMap.get(convId)?.length === 0) {
                    newMap.delete(convId);
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
                const newMap = new Map(prev);
                const current = newMap.get(convId) || [];
                newMap.set(convId, current.filter(id => id !== userId));
                if (newMap.get(convId)?.length === 0) {
                  newMap.delete(convId);
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
  }, [profile?.id, conversationIds.join(',')]); // Join for stable dependency

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

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

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

  // Clean up stale typing indicators (older than 5 seconds)
  const cleanupStale = useCallback(() => {
    const now = Date.now();
    setTypingMap(prev => {
      const newMap = new Map(prev);
      let changed = false;
      
      // We track internal timestamps, but for simplicity we just clear on interval
      // The realtime subscription will repopulate active typers
      return newMap;
    });
  }, []);

  useEffect(() => {
    if (!profile?.id || !conversationIds.length) {
      setTypingMap(new Map());
      return;
    }

    // Subscribe to typing_indicators table for all conversations
    const channel = supabase
      .channel('conversation-typing-global')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_indicators',
        },
        (payload) => {
          const data = payload.new as any;
          const oldData = payload.old as any;
          
          // Only process for conversations we care about
          const convId = data?.conversation_id || oldData?.conversation_id;
          if (!convId || !conversationIds.includes(convId)) return;
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            // Someone started/updated typing
            if (data.user_id === profile.id) return; // Skip our own typing
            
            // Check if typing indicator is recent (within 5 seconds)
            const updatedAt = new Date(data.updated_at || data.created_at).getTime();
            const isRecent = Date.now() - updatedAt < 5000;
            
            if (isRecent) {
              setTypingMap(prev => {
                const newMap = new Map(prev);
                const current = newMap.get(convId) || [];
                if (!current.includes(data.user_id)) {
                  newMap.set(convId, [...current, data.user_id]);
                }
                return newMap;
              });
              
              // Auto-remove after 5 seconds
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
              }, 5000);
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
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

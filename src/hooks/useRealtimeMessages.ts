import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { readQueryArray } from '@/lib/persistedCollections';
import { useAuth } from '@/lib/auth';
import { Message } from './useMessages';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { reportAccountGuard } from '@/lib/reportModerationService';
import { messagesQueryKey } from '@/lib/messagesQueryKey';
import { ownedDmProfileId } from '@/lib/dmAccountScope';

/**
 * Conversation-specific realtime updates (reactions + views only).
 *
 * Message INSERT/UPDATE/DELETE are handled by useGlobalRealtimeMessages
 * via dmScopedMessageRealtime — do not duplicate message listeners here.
 */
export function useRealtimeMessages(conversationId: string | undefined) {
  const { profile, user } = useAuth();
  const session = useReportAccountSession();
  const profileId = user?.id === session.uid ? ownedDmProfileId(session.uid, profile) : null;
  const queryClient = useQueryClient();
  const channelRef = useRef<ReturnType<typeof db.channel> | null>(null);

  useEffect(() => {
    if (!conversationId || !profileId || !session.uid) return;
    const guard = reportAccountGuard(session.uid);
    let active = true;
    const current = () => { try { guard(); return active; } catch { return false; } };
    const key = messagesQueryKey(conversationId, session);

    const knownMessageIds = () => {
      const list = readQueryArray<Message>(queryClient.getQueryData(key));
      return new Set(list.map(m => m.id));
    };

    const channel = subscribePostgresChannel(
      `conv-events:${session.uid}:${session.epoch}:${conversationId}`,
      [
        {
          event: '*',
          table: 'message_reactions',
          callback: (payload) => {
            if (!current()) return;
            const row: any = (payload.new as any) || (payload.old as any);
            if (!row?.message_id) return;
            if (!knownMessageIds().has(row.message_id)) return;
            void queryClient.invalidateQueries({ queryKey: key, exact: true });
          },
        },
        {
          event: '*',
          table: 'message_views',
          callback: (payload) => {
            if (!current()) return;
            const row: any = (payload.new as any) || (payload.old as any);
            if (!row?.message_id) return;
            if (!knownMessageIds().has(row.message_id)) return;
            void queryClient.invalidateQueries({ queryKey: key, exact: true });
          },
        },
      ],
      (status) => {
        if (status === 'SUBSCRIBED' && import.meta.env.DEV) {
          console.log(`[ConvRT] Subscribed to ${conversationId}`);
        }
      },
    );

    channelRef.current = channel;

    return () => {
      active = false;
      removeRealtimeChannel(channel);
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [conversationId, profileId, session.uid, session.epoch, queryClient]);

  return {};
}

/**
 * @deprecated Use useGlobalRealtimeMessages instead.
 * This is kept for backward compatibility but now delegates to the global handler.
 */
export function useRealtimeConversations() {
  // No-op: All realtime updates are now handled by useGlobalRealtimeMessages
  // This function is kept for backward compatibility with existing code
}

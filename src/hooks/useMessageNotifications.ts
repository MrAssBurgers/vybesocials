import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import {
  getSessionAuthUid,
  markConversationReadForViewer,
} from '@/lib/markConversationRead';
import { findInQueryArray, readQueryArray } from '@/lib/persistedCollections';

/**
 * Mark conversation read + cross-device read sync.
 * Foreground DM toasts/sounds are handled by dmScopedMessageRealtime → foregroundDmNotification.
 */

export function useInstantReadClear(conversationId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const markAsRead = useCallback(async () => {
    if (!conversationId || !profile?.id) return;

    const convUnread =
      findInQueryArray(
        queryClient.getQueryData(['dm-conversations', profile.id]),
        (c) => c.id === conversationId,
      )?.unread_count ?? 0;

    const markReadPatch = (old: unknown) => {
      const list = readQueryArray(old);
      if (!list.length) return list;
      return list.map((conv) =>
        conv.id === conversationId
          ? { ...conv, unread_count: 0, _hasUnread: false }
          : conv,
      );
    };

    queryClient.setQueryData<any[]>(['dm-conversations', profile.id], markReadPatch);
    queryClient.setQueryData<any[]>(['conversations', profile.id], markReadPatch);
    queryClient.setQueryData<any[]>(['conversations'], markReadPatch);
    queryClient.setQueryData<number>(
      ['unread-messages-count', profile.id],
      (prev) => (typeof prev === 'number' ? Math.max(0, prev - convUnread) : 0),
    );

    const authUid = await getSessionAuthUid();
    await markConversationReadForViewer(conversationId, profile.id, authUid);
  }, [conversationId, profile?.id, queryClient]);

  useEffect(() => {
    if (conversationId && profile?.id) {
      markAsRead();
    }
  }, [conversationId, profile?.id, markAsRead]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && conversationId) {
        markAsRead();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [conversationId, markAsRead]);

  return { markAsRead };
}

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
          const row: any = payload.new;
          if (!row?.conversation_id) return;

          const patch = (old: any[] | undefined) => {
            if (!old) return old;
            return old.map((c) =>
              c.id === row.conversation_id
                ? { ...c, unread_count: 0, _hasUnread: false }
                : c,
            );
          };
          queryClient.setQueryData<any[]>(['dm-conversations', profile.id], patch);
          queryClient.setQueryData<any[]>(['conversations', profile.id], patch);
          queryClient.invalidateQueries({ queryKey: ['unread-messages-count', profile.id] });
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [profile?.id, queryClient]);
}

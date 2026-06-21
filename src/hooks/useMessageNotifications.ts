import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';

/**
 * Mark conversation read + cross-device read sync.
 * Foreground DM toasts/sounds are handled by dmScopedMessageRealtime → foregroundDmNotification.
 */

export function useInstantReadClear(conversationId: string | undefined) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const hasMarkedReadRef = useRef<string | null>(null);

  const markAsRead = useCallback(async () => {
    if (!conversationId || !profile?.id) return;
    if (hasMarkedReadRef.current === conversationId) return;

    hasMarkedReadRef.current = conversationId;

    const markReadPatch = (old: any[] | undefined) => {
      if (!old) return old;
      return old.map((conv) =>
        conv.id === conversationId
          ? { ...conv, unread_count: 0, _hasUnread: false }
          : conv,
      );
    };

    queryClient.setQueryData<any[]>(['dm-conversations', profile.id], markReadPatch);
    queryClient.setQueryData<any[]>(['conversations', profile.id], markReadPatch);
    queryClient.setQueryData<any[]>(['conversations'], markReadPatch);

    const now = new Date().toISOString();
    await db
      .from('conversation_members')
      .update({ last_read_at: now })
      .eq('conversation_id', conversationId)
      .eq('user_id', profile.id);

    queryClient.setQueryData(['unread-messages-count', profile.id], (old: number | undefined) =>
      Math.max(0, (old || 1) - 1),
    );
    queryClient.invalidateQueries({ queryKey: ['unread-messages-count', profile.id] });
  }, [conversationId, profile?.id, queryClient]);

  useEffect(() => {
    if (conversationId && profile?.id) {
      markAsRead();
    }
  }, [conversationId, profile?.id, markAsRead]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && conversationId) {
        hasMarkedReadRef.current = null;
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

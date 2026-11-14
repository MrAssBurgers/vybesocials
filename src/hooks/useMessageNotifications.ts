import { useEffect, useCallback, startTransition } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import {
  getSessionAuthUid,
  markConversationReadForViewer,
} from '@/lib/markConversationRead';
import { findInQueryArray } from '@/lib/persistedCollections';
import { activeDmListKeys, ownedDmProfileId, viewerDmMembership } from '@/lib/dmAccountScope';
import { patchDmConversationInCache } from '@/lib/dmInboxCachePatch';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { reportAccountSnapshot } from '@/lib/reportModerationService';

/**
 * Mark conversation read + cross-device read sync.
 * Foreground DM toasts/sounds are handled by dmScopedMessageRealtime → foregroundDmNotification.
 */

export function useInstantReadClear(conversationId: string | undefined) {
  const { profile, user } = useAuth();
  const session = useReportAccountSession();
  const profileId = ownedDmProfileId(user?.id, profile);
  const queryClient = useQueryClient();

  const markAsRead = useCallback(async () => {
    if (!conversationId || !profileId || !activeDmListKeys(profileId, session).length) return;
    const lists = activeDmListKeys(profileId, session);
    const convUnread = lists.map(key => findInQueryArray(queryClient.getQueryData(key), c => c.id === conversationId)?.unread_count ?? 0).find(count => count > 0) ?? 0;
    startTransition(() => {
      patchDmConversationInCache(queryClient, profileId, conversationId, { unread_count: 0, _hasUnread: false }, session);
      queryClient.setQueryData<number>(['unread-messages-count', profileId], prev => typeof prev === 'number' ? Math.max(0, prev - convUnread) : prev);
    });
    const authUid = await getSessionAuthUid();
    if (authUid !== session.uid || !activeDmListKeys(profileId, session).length) return;
    await markConversationReadForViewer(conversationId, profileId, authUid);
  }, [conversationId, profileId, session, queryClient]);

  useEffect(() => {
    if (conversationId && profileId) {
      markAsRead();
    }
  }, [conversationId, profileId, markAsRead]);

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
  const { profile, user } = useAuth();
  const session = useReportAccountSession();
  const profileId = ownedDmProfileId(user?.id, profile);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profileId || !activeDmListKeys(profileId, session).length) return;

    const channel = subscribePostgresChannel('cross-device-read-sync', [
      {
        event: 'UPDATE',
        table: 'conversation_members',
        filter: `user_id=eq.${profileId}`,
        callback: (payload) => {
          const current = reportAccountSnapshot();
          if (current.uid !== session.uid || current.epoch !== session.epoch) return;
          const row = payload.new as { conversation_id?: string; user_id?: string; last_read_at?: string };
          if (!row?.conversation_id || row.user_id !== profileId || !row.last_read_at) return;
          // Pin/mute updates are not read receipts. Only clear when the receipt
          // reaches the last visible message, never on mark-unread or old reads.
          for (const key of activeDmListKeys(profileId, session)) {
            const conv = findInQueryArray(queryClient.getQueryData(key), c => c.id === row.conversation_id);
            const lastAt = conv?.last_message?.created_at;
            if (!conv || !lastAt || !viewerDmMembership(conv, profileId, session.uid)
              || Date.parse(row.last_read_at) < Date.parse(lastAt)
              || !Number.isFinite(Date.parse(row.last_read_at))) continue;
            patchDmConversationInCache(queryClient, profileId, row.conversation_id, { unread_count: 0, _hasUnread: false }, session);
          }
          void queryClient.invalidateQueries({ queryKey: ['unread-messages-count', profileId], exact: true });
        },
      },
    ]);

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [profileId, session, queryClient]);
}

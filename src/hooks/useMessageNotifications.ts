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
import { snapshotDmInbox, patchDmConversationInCache } from '@/lib/dmInboxCachePatch';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { reportAccountGuard, reportAccountSnapshot } from '@/lib/reportModerationService';
import { isAppForeground, subscribeForegroundReadPhase } from '@/lib/foregroundReadPhase';

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
    if (!isAppForeground()) return;
    const accountGuard = reportAccountGuard(session.uid);
    const guard = () => { accountGuard(); if (!activeDmListKeys(profileId, session).length) throw new Error('Your account session changed.'); };
    const restore = snapshotDmInbox(queryClient, profileId, session, conversationId);
    const lists = activeDmListKeys(profileId, session);
    const convUnread = Math.max(0, ...lists.map(key => findInQueryArray(queryClient.getQueryData(key), c => c.id === conversationId)?.unread_count || 0));
    startTransition(() => {
      guard(); patchDmConversationInCache(queryClient, profileId, conversationId, { unread_count: 0, _hasUnread: false }, session);
      queryClient.setQueryData<number>(['unread-messages-count', profileId], prev => typeof prev === 'number' ? Math.max(0, prev - convUnread) : prev);
    });
    restore.capture();
    try {
      const authUid = await getSessionAuthUid(); guard();
      if (authUid !== session.uid) throw new Error('Your account session changed.');
      await markConversationReadForViewer(conversationId, profileId, authUid, guard); guard();
    } catch (error) {
      try { guard(); } catch { return; }
      restore.restore();
      for (const key of lists) void queryClient.invalidateQueries({ queryKey: key, exact: true });
      throw error;
    } finally {
      try { guard(); void queryClient.invalidateQueries({ queryKey: ['unread-messages-count', profileId], exact: true }); } catch { /* retired session */ }
    }
  }, [conversationId, profileId, session, queryClient]);

  useEffect(() => {
    if (conversationId && profileId) {
      void markAsRead().catch(() => {});
    }
  }, [conversationId, profileId, markAsRead]);

  useEffect(() => {
    return subscribeForegroundReadPhase(() => { if (isAppForeground() && conversationId) void markAsRead().catch(() => {}); });
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

    const callback = (payload: { new: unknown }) => {
      const current = reportAccountSnapshot();
      if (current.uid !== session.uid || current.epoch !== session.epoch) return;
      const row = payload.new as { conversation_id?: string; user_id?: string; last_read_at?: string };
      if (!row || !row.conversation_id || ![profileId, session.uid].includes(row.user_id) || !row.last_read_at) return;
      const readAt = Date.parse(row.last_read_at);
      if (!Number.isFinite(readAt)) return;
      for (const key of activeDmListKeys(profileId, session)) {
        const conv = findInQueryArray(queryClient.getQueryData(key), c => c.id === row.conversation_id);
        const lastAt = Date.parse(conv?.last_message?.created_at || '');
        if (!conv || !Number.isFinite(lastAt) || readAt < lastAt || !viewerDmMembership(conv, profileId, session.uid)) continue;
        queryClient.setQueryData(key, (old: unknown) => Array.isArray(old) ? old.map(item => item === conv ? { ...item, unread_count: 0, _hasUnread: false } : item) : old);
      }
      void queryClient.invalidateQueries({ queryKey: ['unread-messages-count', profileId], exact: true });
    };
    const channel = subscribePostgresChannel('cross-device-read-sync', [...new Set([profileId, session.uid])].map(actor => ({
      event: 'UPDATE' as const, table: 'conversation_members', filter: `user_id=eq.${actor}`, callback,
    })));

    return () => {
      removeRealtimeChannel(channel);
    };
  }, [profileId, session, queryClient]);
}

/**
 * Global Realtime Messages Hook
 * 
 * Runs at App level to ensure DM updates happen EVERYWHERE instantly
 * - Updates conversation list when ANY message arrives
 * - Plays notification sounds for messages from other users
 * - Ensures receiver sees messages instantly without refresh
 * - Includes deduplication and retry logic for reliability
 */

import { useEffect, useRef, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { conversationDetailQueryKey, dmListQueryKey, isDmConversationForViewer, ownedDmProfileId } from '@/lib/dmAccountScope';
import { readQueryArray } from '@/lib/persistedCollections';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { reportAccountSnapshot, type ReportAccountSession } from '@/lib/reportModerationService';
import { removeChannelByTopic, removeRealtimeChannel, subscribePostgresChannel } from '@/lib/realtimeChannel';
import { subscribeDmBroadcastMessages } from '@/lib/dmBroadcast';
import {
  applyBroadcastMessage,
  setupScopedMessageRealtime,
  type ScopedMessageRealtimeContext,
  type ScopedMessageRealtimeHandle,
} from '@/lib/dmScopedMessageRealtime';

// Track the current conversation globally with a tiny pub/sub so React
// effects can react to changes (a plain module variable did not trigger
// re-subscription of the broadcast channel when the user opened a DM).
let currentConversationId: string | null = null;
const currentConversationListeners = new Set<(id: string | null) => void>();

export function setCurrentConversationId(id: string | null) {
  if (currentConversationId === id) return;
  currentConversationId = id;
  currentConversationListeners.forEach(l => {
    try { l(id); } catch { /* noop */ }
  });
}

function subscribeCurrentConversationId(listener: (id: string | null) => void) {
  currentConversationListeners.add(listener);
  return () => { currentConversationListeners.delete(listener); };
}

// Deduplication: Track recently processed message IDs (30 second window)
const processedMessages = new Map<string, number>();
const DEDUP_WINDOW_MS = 30000;

function cleanupProcessedMessages() {
  const now = Date.now();
  for (const [id, timestamp] of processedMessages) {
    if (now - timestamp > DEDUP_WINDOW_MS) {
      processedMessages.delete(id);
    }
  }
}

function isMessageProcessed(messageId: string): boolean {
  cleanupProcessedMessages();
  return processedMessages.has(messageId);
}

function markMessageProcessed(messageId: string) {
  processedMessages.set(messageId, Date.now());
}

// Track optimistic messages to prevent duplicates for sender
const pendingOptimisticMessages = new Map<string, { content: string; senderId: string; timestamp: number }>();

function optimisticDedupeKey(conversationId: string, content: string | null | undefined) {
  return `${conversationId}:${(content || '').trim().slice(0, 50)}`;
}

export function registerOptimisticMessage(conversationId: string, content: string, senderId: string) {
  const key = optimisticDedupeKey(conversationId, content);
  pendingOptimisticMessages.set(key, { content, senderId, timestamp: Date.now() });

  // Auto-cleanup after 10 seconds
  setTimeout(() => pendingOptimisticMessages.delete(key), 10000);
}

function isOptimisticDuplicate(conversationId: string, content: string, _senderId: string): boolean {
  const key = optimisticDedupeKey(conversationId, content);
  const pending = pendingOptimisticMessages.get(key);
  if (pending && Date.now() - pending.timestamp < 5000) {
    pendingOptimisticMessages.delete(key);
    return true;
  }
  return false;
}


// Debounced refetch for the unknown-conversation case
let unknownConvoRefetchTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleUnknownConvoRefetch(qc: ReturnType<typeof useQueryClient>, profileId: string, session: ReportAccountSession) {
  if (unknownConvoRefetchTimer) return;
  unknownConvoRefetchTimer = setTimeout(() => {
    unknownConvoRefetchTimer = null;
    if (!isCurrentSession(session)) return;
    void qc.invalidateQueries({ queryKey: dmListQueryKey(profileId, session), exact: true });
    void qc.invalidateQueries({ queryKey: ['conversations', profileId, session.uid, session.epoch], exact: true });
  }, 800);
}

function isCurrentSession(session: ReportAccountSession) {
  const current = reportAccountSnapshot();
  return !!session.uid && session.uid === current.uid && session.epoch === current.epoch;
}

function isPresenceOnline(isOnline: boolean | undefined, lastSeenAt: string | undefined): boolean {
  if (!isOnline) return false;
  if (!lastSeenAt) return true;
  return Date.now() - new Date(lastSeenAt).getTime() <= 90_000;
}

/** Patch batch presence maps in-place — never invalidate (that refetched the whole DM list). */
function patchUsersPresenceCache(
  qc: ReturnType<typeof useQueryClient>,
  userId: string,
  isOnline: boolean,
  lastSeenAt: string,
) {
  const nextOnline = isPresenceOnline(isOnline, lastSeenAt);
  qc.setQueriesData<Record<string, boolean>>(
    { queryKey: ['users-presence'] },
    (old) => {
      if (!old || typeof old !== 'object') return old;
      if (!(userId in old)) return old;
      if (old[userId] === nextOnline) return old;
      return { ...old, [userId]: nextOnline };
    },
  );
}

export function useGlobalRealtimeMessages() {
  const { profile, user } = useAuth();
  const session = useReportAccountSession();
  const profileId = user?.id === session.uid ? ownedDmProfileId(session.uid, profile) : undefined;
  const authUid = user?.id === session.uid ? user?.id ?? null : null;
  const queryClient = useQueryClient();
  const scopedRtRef = useRef<ScopedMessageRealtimeHandle | null>(null);
  const rtContext = useMemo<ScopedMessageRealtimeContext>(() => ({
    accountSession: session,
    profileId: profileId!,
    authUid,
    queryClient,
    getViewingConversationId: () => currentConversationId,
    isMessageProcessed: id => isMessageProcessed(`${session.uid}:${session.epoch}:${id}`),
    markMessageProcessed: id => markMessageProcessed(`${session.uid}:${session.epoch}:${id}`),
    isOptimisticDuplicate,
    scheduleUnknownConvoRefetch: (pid: string) => scheduleUnknownConvoRefetch(queryClient, pid, session),
  }), [profileId, authUid, queryClient, session]);

  // Global presence channel — patches ['user-presence', id] and
  // ['users-presence', ...] caches as soon as anyone toggles online/offline,
  // so the DM list reflects status in near-realtime instead of waiting 20s.
  const presenceChannelRef = useRef<ReturnType<typeof db.channel> | null>(null);
  useEffect(() => {
    if (!profileId || !isCurrentSession(session)) return;
    let active = true;
    removeRealtimeChannel(presenceChannelRef.current);
    presenceChannelRef.current = null;
    removeChannelByTopic(`global-presence:${profileId}`);

    const ch = subscribePostgresChannel(`global-presence:${profileId}`, [
      {
        event: '*',
        table: 'user_presence',
        callback: (payload: any) => {
          if (!active || !isCurrentSession(session)) return;
          const row = payload.new || payload.old;
          if (!row?.user_id) return;
          queryClient.setQueryData(['user-presence', row.user_id], {
            is_online: row.is_online,
            last_seen_at: row.last_seen_at,
          });
          patchUsersPresenceCache(
            queryClient,
            row.user_id,
            row.is_online,
            row.last_seen_at,
          );
        },
      },
    ]);
    presenceChannelRef.current = ch;
    return () => {
      active = false;
      try {
        removeRealtimeChannel(presenceChannelRef.current);
        presenceChannelRef.current = null;
      } catch { /* never throw from cleanup */ }
    };
  }, [profileId, queryClient, session]);

  // Broadcast listener for instant delivery on the currently viewed conversation
  const [activeConvoId, setActiveConvoId] = useState<string | null>(currentConversationId);

  useEffect(() => {
    return subscribeCurrentConversationId(setActiveConvoId);
  }, []);

  useEffect(() => {
    if (!profileId || !activeConvoId) return;
    let active = true;
    const convoId = activeConvoId;
    const captured = { ...rtContext, isActive: () => active };
    const unsubscribe = subscribeDmBroadcastMessages(convoId, (msg) => {
      if (!active || !isCurrentSession(session) || msg?.conversation_id !== convoId) return;
      if (!msg?.id || msg.sender_id === profileId || msg.sender_id === authUid) return;
      // A native BroadcastChannel can outlive the account that opened a thread.
      // Require this session's verified conversation before using its fast path;
      // Firestore delivery remains available while the authorized view loads.
      const detail = queryClient.getQueryData(conversationDetailQueryKey(convoId, session));
      const list = readQueryArray(queryClient.getQueryData(dmListQueryKey(profileId, session)));
      if (!isDmConversationForViewer(detail, profileId, authUid)
        && !list.some(row => row?.id === convoId && isDmConversationForViewer(row, profileId, authUid))) return;
      applyBroadcastMessage(captured, msg);
    });
    return () => { active = false; unsubscribe(); };
  }, [profileId, authUid, rtContext, activeConvoId, session, queryClient]);

  // Resync scoped listeners when conversation list cache updates (debounced)
  useEffect(() => {
    if (!profileId) return;
    let resyncTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleResync = () => {
      if (resyncTimer) return;
      resyncTimer = setTimeout(() => {
        resyncTimer = null;
        void scopedRtRef.current?.resync();
      }, 250);
    };
    const unsub = queryClient.getQueryCache().subscribe((event) => {
      try {
        if (event?.type !== 'updated') return;
        const key = event.query?.queryKey;
        if (!Array.isArray(key)) return;
        if ((key[0] === 'dm-conversations' || key[0] === 'conversations')
          && key[1] === profileId && key[2] === session.uid && key[3] === session.epoch && isCurrentSession(session)) {
          scheduleResync();
        }
      } catch (err) {
        if (import.meta.env.DEV) console.warn('[GlobalRT] cache subscribe failed', err);
      }
    });
    return () => {
      if (resyncTimer) clearTimeout(resyncTimer);
      unsub();
    };
  }, [profileId, queryClient, session]);

  useEffect(() => {
    if (!profileId) return;
    scopedRtRef.current?.teardown();
    const handle = setupScopedMessageRealtime(rtContext);
    scopedRtRef.current = handle;
    return () => {
      handle.teardown();
      if (scopedRtRef.current === handle) scopedRtRef.current = null;
    };
  }, [profileId, rtContext]);

  // Resync when user opens a DM (may not be in list cache yet)
  useEffect(() => {
    if (activeConvoId) scopedRtRef.current?.resync();
  }, [activeConvoId]);
}

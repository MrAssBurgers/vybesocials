import { useEffect, useMemo, useRef, useState } from 'react';
import type { Conversation } from '@/hooks/useMessages';
import { subscribeUserPresence, toUiActivity, type UserPresenceDoc } from '@/lib/usersPresenceDoc';
import { uiActivityFromState } from '@/lib/presenceActivity';
import type { ActivityType } from '@/components/chat/LiveActivityIndicator';
import { inferOtherUserIdFromConversation } from '@/lib/dmMemberResolve';
import { sortDmConversations } from '@/lib/dmConversationSort';
import { MAX_CONVERSATION_PRESENCE_LISTENERS } from '@/lib/performanceConfig';

export type ConversationPresenceMap = Map<string, ActivityType>;

/**
 * Live Snapchat-style presence per conversation row (Firestore users/{id}).
 * Capped to recent + pinned threads (same priority as scoped DM listeners).
 */
export function useConversationListPresence(
  conversations: Conversation[],
  profileId: string | undefined,
  authUid: string | undefined,
  activeConversationId?: string | null,
): ConversationPresenceMap {
  const targets = useMemo(() => {
    if (!profileId) return [];

    const sorted = sortDmConversations(conversations, profileId);
    const rows: { conversationId: string; peerId: string }[] = [];
    const seenPeers = new Set<string>();

    const pushRow = (conv: Conversation) => {
      if (rows.length >= MAX_CONVERSATION_PRESENCE_LISTENERS) return;
      if (conv.is_group) return;
      const peerId = inferOtherUserIdFromConversation(conv, profileId, authUid);
      if (!peerId || peerId === profileId || seenPeers.has(peerId)) return;
      seenPeers.add(peerId);
      rows.push({ conversationId: conv.id, peerId });
    };

    if (activeConversationId) {
      const active = sorted.find((c) => c.id === activeConversationId);
      if (active) pushRow(active);
    }

    for (const conv of sorted) {
      if (conv.id === activeConversationId) continue;
      pushRow(conv);
    }

    return rows;
  }, [conversations, profileId, authUid, activeConversationId]);

  const targetsKey = useMemo(
    () => targets.map((t) => `${t.conversationId}:${t.peerId}`).join('|'),
    [targets],
  );
  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  const [activityByConversation, setActivityByConversation] =
    useState<ConversationPresenceMap>(new Map());

  useEffect(() => {
    const currentTargets = targetsRef.current;
    if (!currentTargets.length) {
      setActivityByConversation(previous => previous.size ? new Map() : previous);
      return;
    }

    let active = true;
    const peerDocs = new Map<string, UserPresenceDoc | null>();

    const sync = () => {
      if (!active) return;
      const next = new Map<string, ActivityType>();
      for (const { conversationId, peerId } of currentTargets) {
        const doc = peerDocs.get(peerId) ?? null;
        const state = toUiActivity(doc, conversationId);
        if (state === 'offline') continue;
        const mapped = uiActivityFromState(state);
        // App-level "online" maps to idle so a thread does not say "in chat".
        // The inbox dot still needs a non-idle activity to light up.
        const activity = state === 'online' && mapped === 'idle' ? 'viewing' : mapped;
        if (activity !== 'idle') next.set(conversationId, activity);
      }
      setActivityByConversation(previous => previous.size === next.size
        && [...next].every(([id, activity]) => previous.get(id) === activity) ? previous : next);
    };

    const unsubs = currentTargets.map(({ peerId }) =>
      subscribeUserPresence(peerId, (doc) => {
        peerDocs.set(peerId, doc);
        sync();
      }),
    );

    return () => {
      active = false;
      unsubs.forEach((u) => u());
    };
  }, [targetsKey, profileId, authUid]);

  return activityByConversation;
}

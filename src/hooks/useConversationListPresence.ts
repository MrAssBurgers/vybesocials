import { useEffect, useMemo, useState } from 'react';
import type { Conversation } from '@/hooks/useMessages';
import { subscribeUserPresence, toUiActivity, type UserPresenceDoc } from '@/lib/usersPresenceDoc';
import { uiActivityFromState } from '@/lib/presenceActivity';
import type { ActivityType } from '@/components/chat/LiveActivityIndicator';
import { inferOtherUserIdFromConversation } from '@/lib/dmMemberResolve';

const MAX_TRACKED = 30;

export type ConversationPresenceMap = Map<string, ActivityType>;

/**
 * Live Snapchat-style presence per conversation row (Firestore users/{id}).
 */
export function useConversationListPresence(
  conversations: Conversation[],
  profileId: string | undefined,
  authUid: string | undefined,
): ConversationPresenceMap {
  const targets = useMemo(() => {
    if (!profileId) return [];
    const rows: { conversationId: string; peerId: string }[] = [];
    for (const conv of conversations) {
      if (rows.length >= MAX_TRACKED) break;
      if (conv.is_group) continue;
      const peerId = inferOtherUserIdFromConversation(conv, profileId, authUid);
      if (peerId && peerId !== profileId) {
        rows.push({ conversationId: conv.id, peerId });
      }
    }
    return rows;
  }, [conversations, profileId, authUid]);

  const targetsKey = useMemo(
    () => targets.map((t) => `${t.conversationId}:${t.peerId}`).join('|'),
    [targets],
  );

  const [activityByConversation, setActivityByConversation] =
    useState<ConversationPresenceMap>(new Map());

  useEffect(() => {
    if (!targets.length) {
      setActivityByConversation(new Map());
      return;
    }

    const peerDocs = new Map<string, UserPresenceDoc | null>();

    const sync = () => {
      const next = new Map<string, ActivityType>();
      for (const { conversationId, peerId } of targets) {
        const doc = peerDocs.get(peerId) ?? null;
        const state = toUiActivity(doc, conversationId);
        if (state === 'offline') continue;
        const activity = uiActivityFromState(state);
        if (activity !== 'idle') next.set(conversationId, activity);
      }
      setActivityByConversation(next);
    };

    const unsubs = targets.map(({ peerId }) =>
      subscribeUserPresence(peerId, (doc) => {
        peerDocs.set(peerId, doc);
        sync();
      }),
    );

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [targetsKey, targets]);

  return activityByConversation;
}

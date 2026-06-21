import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import {
  enterConversationPresence,
  leaveConversationPresence,
  setUserActivity,
  subscribeUserPresence,
  toUiActivity,
  type UserActivityState,
  type UserPresenceDoc,
} from '@/lib/usersPresenceDoc';
import {
  prewarmDmBroadcastChannel,
  sendDmBroadcastActivity,
  subscribeDmBroadcastActivity,
  type DmActivityPayload,
} from '@/lib/dmBroadcast';
import type { ActivityType } from '@/components/chat/LiveActivityIndicator';

export interface PeerPresence {
  user_id: string;
  username: string;
  avatar_url: string | null;
  display_name: string | null;
  activity: ActivityType;
  is_online: boolean;
}

function uiActivityFromState(state: UserActivityState): ActivityType {
  switch (state) {
    case 'typing':
      return 'typing';
    case 'recording_voice':
      return 'recording_voice';
    case 'recording_video':
      return 'recording_video';
    case 'taking_photo':
    case 'sending_vybe':
      return 'taking_photo';
    case 'uploading_image':
      return 'uploading_image';
    case 'uploading_video':
      return 'uploading_video';
    case 'in_call':
      return 'in_call';
    case 'viewing':
    case 'online':
      return 'viewing';
    default:
      return 'idle';
  }
}

function broadcastActivity(
  conversationId: string,
  profileId: string,
  activity: ActivityType,
  meta: { username: string; displayName: string; avatarUrl: string | null },
): void {
  const payload: DmActivityPayload = {
    userId: profileId,
    activity:
      activity === 'idle'
        ? 'idle'
        : (activity as DmActivityPayload['activity']),
    username: meta.username,
    displayName: meta.displayName,
    avatarUrl: meta.avatarUrl,
  };
  void sendDmBroadcastActivity(conversationId, payload);
}

function normalizePeerIds(
  peerProfileIds?: string | string[] | null,
): string[] {
  if (!peerProfileIds) return [];
  const raw = Array.isArray(peerProfileIds) ? peerProfileIds : [peerProfileIds];
  return [...new Set(raw.filter(Boolean))] as string[];
}

function mapDocToPeer(
  doc: UserPresenceDoc | null,
  peerProfileId: string,
  conversationId: string,
): PeerPresence | null {
  if (!doc) return null;
  const activity = toUiActivity(doc, conversationId);
  if (activity === 'offline') return null;
  return {
    user_id: peerProfileId,
    username: doc.username || '',
    avatar_url: doc.avatar_url ?? null,
    display_name: doc.display_name ?? null,
    activity: uiActivityFromState(activity),
    is_online: doc.online,
  };
}

/**
 * Snapchat-style chat presence — Firestore `users/{profileId}` + instant broadcast.
 * Supports 1:1 (single peer id) and group chats (array of peer profile ids).
 */
export function useChatPresence(
  conversationId: string | undefined,
  peerProfileIds?: string | string[] | null,
) {
  const { profile } = useAuth();
  const profileId = useAuthProfileId();
  const effectiveProfileId = profileId ?? profile?.id;

  const peerIdsKey = useMemo(
    () => normalizePeerIds(peerProfileIds).sort().join(','),
    [peerProfileIds],
  );
  const peerIds = useMemo(
    () => normalizePeerIds(peerProfileIds),
    [peerIdsKey, peerProfileIds],
  );

  const [peerMap, setPeerMap] = useState<Map<string, PeerPresence>>(new Map());
  const activityRef = useRef<UserActivityState>('viewing');
  const metaRef = useRef({
    username: profile?.username || '',
    displayName: (profile as { display_name?: string | null })?.display_name || profile?.username || '',
    avatarUrl: profile?.avatar_url || null,
  });

  useEffect(() => {
    metaRef.current = {
      username: profile?.username || '',
      displayName: (profile as { display_name?: string | null })?.display_name || profile?.username || '',
      avatarUrl: profile?.avatar_url || null,
    };
  }, [profile?.username, profile?.avatar_url, profile]);

  const applyActivity = useCallback(
    (activity: UserActivityState) => {
      const cid = conversationId;
      const pid = effectiveProfileId;
      if (!cid || !pid) return;

      activityRef.current = activity;
      const ui = uiActivityFromState(activity);

      broadcastActivity(cid, pid, ui, metaRef.current);
      void setUserActivity(pid, cid, activity, metaRef.current);
    },
    [conversationId, effectiveProfileId],
  );

  const setTyping = useCallback(
    (isTyping: boolean) => {
      applyActivity(isTyping ? 'typing' : 'viewing');
    },
    [applyActivity],
  );

  const setRecordingVoice = useCallback(
    (isRecording: boolean) => {
      applyActivity(isRecording ? 'recording_voice' : 'viewing');
    },
    [applyActivity],
  );

  const setRecordingVideo = useCallback(
    (isRecording: boolean) => {
      applyActivity(isRecording ? 'recording_video' : 'viewing');
    },
    [applyActivity],
  );

  const setTakingPhoto = useCallback(
    (isTaking: boolean) => {
      applyActivity(isTaking ? 'taking_photo' : 'viewing');
    },
    [applyActivity],
  );

  const setUploadingImage = useCallback(
    (isUploading: boolean) => {
      applyActivity(isUploading ? 'uploading_image' : 'viewing');
    },
    [applyActivity],
  );

  const setUploadingVideo = useCallback(
    (isUploading: boolean) => {
      applyActivity(isUploading ? 'uploading_video' : 'viewing');
    },
    [applyActivity],
  );

  const setSendingVybe = useCallback(
    (isSending: boolean) => {
      applyActivity(isSending ? 'sending_vybe' : 'viewing');
    },
    [applyActivity],
  );

  // Own presence: enter chat on mount, leave on unmount.
  useEffect(() => {
    if (!conversationId || !effectiveProfileId) return;

    prewarmDmBroadcastChannel(conversationId);
    void enterConversationPresence(effectiveProfileId, conversationId, metaRef.current);
    broadcastActivity(conversationId, effectiveProfileId, 'viewing', metaRef.current);

    const handleVisibility = () => {
      if (document.hidden) {
        void leaveConversationPresence(effectiveProfileId);
        broadcastActivity(conversationId, effectiveProfileId, 'idle', metaRef.current);
      } else {
        void enterConversationPresence(effectiveProfileId, conversationId, metaRef.current);
        applyActivity(activityRef.current === 'offline' ? 'viewing' : activityRef.current);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      void leaveConversationPresence(effectiveProfileId);
      broadcastActivity(conversationId, effectiveProfileId, 'idle', metaRef.current);
    };
  }, [conversationId, effectiveProfileId, applyActivity]);

  // Peers: Firestore listeners (primary) + broadcast (same-tab instant).
  useEffect(() => {
    if (!conversationId || !effectiveProfileId || peerIds.length === 0) {
      setPeerMap(new Map());
      return;
    }

    const targets = peerIds.filter((id) => id !== effectiveProfileId);
    if (targets.length === 0) {
      setPeerMap(new Map());
      return;
    }

    let mounted = true;
    const localMap = new Map<string, PeerPresence>();

    const sync = () => {
      if (mounted) setPeerMap(new Map(localMap));
    };

    const firestoreUnsubs = targets.map((peerId) =>
      subscribeUserPresence(peerId, (doc) => {
        const mapped = mapDocToPeer(doc, peerId, conversationId);
        if (mapped) localMap.set(peerId, mapped);
        else localMap.delete(peerId);
        sync();
      }),
    );

    const unsubBroadcast = subscribeDmBroadcastActivity(conversationId, (payload) => {
      if (!targets.includes(payload.userId)) return;
      if (payload.activity === 'idle') {
        localMap.delete(payload.userId);
        sync();
        return;
      }
      localMap.set(payload.userId, {
        user_id: payload.userId,
        username: payload.username || '',
        avatar_url: payload.avatarUrl ?? null,
        display_name: payload.displayName || payload.username || null,
        activity: payload.activity as ActivityType,
        is_online: true,
      });
      sync();
    });

    return () => {
      mounted = false;
      firestoreUnsubs.forEach((u) => u());
      unsubBroadcast();
    };
  }, [conversationId, effectiveProfileId, peerIdsKey, peerIds]);

  const peerPresences = useMemo(() => [...peerMap.values()], [peerMap]);

  const peerPresence = useMemo(() => {
    if (peerPresences.length === 0) return null;
    if (peerPresences.length === 1) return peerPresences[0] ?? null;
    return (
      peerPresences.find((p) => p.activity !== 'viewing' && p.activity !== 'idle') ??
      peerPresences[0] ??
      null
    );
  }, [peerPresences]);

  const presentUsers = useMemo(
    () =>
      peerPresences
        .filter((p) => p.is_online && p.activity !== 'idle')
        .map((p) => ({
          user_id: p.user_id,
          username: p.username,
          avatar_url: p.avatar_url,
          display_name: p.display_name,
          is_typing: p.activity === 'typing',
        })),
    [peerPresences],
  );

  const typingUsers = useMemo(
    () => peerPresences.filter((p) => p.activity === 'typing').map((p) => p.user_id),
    [peerPresences],
  );

  return {
    peerPresence,
    peerPresences,
    presentUsers,
    typingUsers,
    setTyping,
    setRecordingVoice,
    setRecordingVideo,
    setTakingPhoto,
    setUploadingImage,
    setUploadingVideo,
    setSendingVybe,
    applyActivity,
  };
}

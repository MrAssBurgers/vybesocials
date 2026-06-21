import { useState, useEffect, useCallback, useRef } from 'react';
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

/**
 * Snapchat-style chat presence — Firestore `users/{profileId}` + instant broadcast.
 * No polling; peer updates via onSnapshot.
 */
export function useChatPresence(
  conversationId: string | undefined,
  peerProfileId?: string | null,
) {
  const { profile } = useAuth();
  const profileId = useAuthProfileId();
  const effectiveProfileId = profileId ?? profile?.id;

  const [peerPresence, setPeerPresence] = useState<PeerPresence | null>(null);
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

  const mapPeerDoc = useCallback(
    (doc: UserPresenceDoc | null): PeerPresence | null => {
      if (!doc || !peerProfileId || !conversationId) return null;
      const activity = toUiActivity(doc, conversationId);
      if (activity === 'offline') return null;
      return {
        user_id: doc.user_id,
        username: doc.username || '',
        avatar_url: doc.avatar_url ?? null,
        display_name: doc.display_name ?? null,
        activity: uiActivityFromState(activity),
        is_online: doc.online,
      };
    },
    [conversationId, peerProfileId],
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

  // Peer: Firestore listener (primary) + broadcast (same-tab instant).
  useEffect(() => {
    if (!conversationId || !peerProfileId || !effectiveProfileId) return;
    if (peerProfileId === effectiveProfileId) return;

    let mounted = true;

    const unsubFirestore = subscribeUserPresence(peerProfileId, (doc) => {
      if (!mounted) return;
      setPeerPresence(mapPeerDoc(doc));
    });

    const unsubBroadcast = subscribeDmBroadcastActivity(conversationId, (payload) => {
      if (!mounted || payload.userId !== peerProfileId) return;
      if (payload.activity === 'idle') {
        setPeerPresence(null);
        return;
      }
      setPeerPresence({
        user_id: payload.userId,
        username: payload.username || '',
        avatar_url: payload.avatarUrl ?? null,
        display_name: payload.displayName || payload.username || null,
        activity: payload.activity as ActivityType,
        is_online: true,
      });
    });

    return () => {
      mounted = false;
      unsubFirestore();
      unsubBroadcast();
    };
  }, [conversationId, peerProfileId, effectiveProfileId, mapPeerDoc]);

  // Legacy shape for group chats / MessageInputArea
  const presentUsers = peerPresence
    ? [
        {
          user_id: peerPresence.user_id,
          username: peerPresence.username,
          avatar_url: peerPresence.avatar_url,
          display_name: peerPresence.display_name,
          is_typing: peerPresence.activity === 'typing',
        },
      ]
    : [];

  const typingUsers = peerPresence?.activity === 'typing' ? [peerPresence.user_id] : [];

  return {
    peerPresence,
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

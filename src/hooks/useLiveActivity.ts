import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { ActivityType } from '@/components/chat/LiveActivityIndicator';
import {
  prewarmDmBroadcastChannel,
  sendDmBroadcastActivity,
  subscribeDmBroadcastActivity,
} from '@/lib/dmBroadcast';

interface ActivityUser {
  user_id: string;
  username: string;
  avatar_url: string | null;
  display_name: string | null;
  activity: ActivityType;
}

/**
 * Ultra-fast live activity tracking for DMs
 * Tracks: viewing, typing, recording voice, recording video, taking photo
 * Updates every 2 seconds for maximum responsiveness
 */
export function useLiveActivity(conversationId: string | undefined) {
  const { profile, user } = useAuth();
  const profileId = useAuthProfileId();
  const effectiveProfileId = profileId ?? profile?.id;
  const authUid = user?.id ?? profile?.user_id ?? null;
  const [otherUserActivity, setOtherUserActivity] = useState<ActivityUser | null>(null);
  const [isOtherUserPresent, setIsOtherUserPresent] = useState(false);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const activityRef = useRef<ActivityType>('idle');
  const lastActivityUpdateRef = useRef<number>(0);
  const lastBroadcastAtRef = useRef<number>(0);

  // Set my current activity - fire-and-forget (non-blocking)
  const setActivity = useCallback((activity: ActivityType) => {
    if (!conversationId || !effectiveProfileId) return;
    
    const now = Date.now();
    if (now - lastActivityUpdateRef.current < 200 && activity === activityRef.current) return;
    lastActivityUpdateRef.current = now;
    activityRef.current = activity;

    void sendDmBroadcastActivity(conversationId, {
      userId: effectiveProfileId,
      activity,
      username: profile?.username || '',
      displayName: (profile as { display_name?: string | null }).display_name || profile?.username || '',
      avatarUrl: profile?.avatar_url || null,
    });

    const presenceDocId = `${conversationId}_${effectiveProfileId}`;
    const updateActivity = async () => {
      try {
        if (activity === 'idle') {
          await db
            .from('typing_indicators')
            .delete()
            .eq('conversation_id', conversationId)
            .eq('user_id', effectiveProfileId);
        } else {
          await db
            .from('typing_indicators')
            .upsert(
              {
                id: presenceDocId,
                conversation_id: conversationId,
                user_id: effectiveProfileId,
                started_at: new Date().toISOString(),
              },
              { onConflict: 'conversation_id,user_id', ignoreDuplicates: false }
            );
          
          await db
            .from('chat_presence')
            .upsert(
              {
                id: presenceDocId,
                conversation_id: conversationId,
                user_id: effectiveProfileId,
                last_seen_at: new Date().toISOString(),
              },
              { onConflict: 'conversation_id,user_id' }
            );
        }
      } catch (error) {
        // Silent fail - non-critical
      }
    };
    
    // Execute async but don't wait
    updateActivity();
  }, [conversationId, effectiveProfileId, profile?.username, profile?.avatar_url, profile]);

  // Quick helpers for specific activities
  const setTyping = useCallback((isTyping: boolean) => {
    setActivity(isTyping ? 'typing' : 'viewing');
  }, [setActivity]);

  const setRecordingVoice = useCallback((isRecording: boolean) => {
    setActivity(isRecording ? 'recording_voice' : 'viewing');
  }, [setActivity]);

  const setRecordingVideo = useCallback((isRecording: boolean) => {
    setActivity(isRecording ? 'recording_video' : 'viewing');
  }, [setActivity]);

  const setTakingPhoto = useCallback((isTaking: boolean) => {
    setActivity(isTaking ? 'taking_photo' : 'viewing');
  }, [setActivity]);

  // Fetch other user's activity
  const fetchActivity = useCallback(async () => {
    if (!conversationId || !effectiveProfileId) return;

    try {
      const threeSecondsAgo = new Date(Date.now() - 3000).toISOString();
      const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();
      const selfIds = new Set([effectiveProfileId, authUid].filter(Boolean) as string[]);

      const { data: typingData } = await db
        .from('typing_indicators')
        .select('user_id, started_at')
        .eq('conversation_id', conversationId)
        .gt('started_at', threeSecondsAgo);

      const typingRow = (typingData || []).find(
        (row: { user_id?: string }) => row.user_id && !selfIds.has(String(row.user_id)),
      );

      const { data: presenceData } = await db
        .from('chat_presence')
        .select('user_id, last_seen_at')
        .eq('conversation_id', conversationId)
        .gt('last_seen_at', tenSecondsAgo);

      const presenceRow = (presenceData || []).find(
        (row: { user_id?: string }) => row.user_id && !selfIds.has(String(row.user_id)),
      );

      const peerId = typingRow?.user_id || presenceRow?.user_id;
      if (!peerId) {
        setOtherUserActivity(null);
        setIsOtherUserPresent(false);
        return;
      }

      const { data: peerProfile } = await db
        .from('profiles')
        .select('id, username, avatar_url, display_name')
        .eq('id', peerId)
        .maybeSingle();

      const profileRow = peerProfile as {
        username?: string;
        avatar_url?: string | null;
        display_name?: string | null;
      } | null;

      setOtherUserActivity({
        user_id: peerId,
        username: profileRow?.username || '',
        avatar_url: profileRow?.avatar_url ?? null,
        display_name: profileRow?.display_name ?? null,
        activity: typingRow ? 'typing' : 'viewing',
      });
      setIsOtherUserPresent(true);
    } catch (error) {
      // Silent fail
    }
  }, [conversationId, effectiveProfileId, authUid]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!conversationId || !effectiveProfileId) return;

    let isMounted = true;
    const presenceDocId = `${conversationId}_${effectiveProfileId}`;

    const joinPresence = async () => {
      if (!isMounted) return;
      try {
        await db
          .from('chat_presence')
          .upsert(
            {
              id: presenceDocId,
              conversation_id: conversationId,
              user_id: effectiveProfileId,
              last_seen_at: new Date().toISOString(),
            },
            { onConflict: 'conversation_id,user_id' }
          );
      } catch (error) {
        // Silent fail
      }
    };

    const leavePresence = async () => {
      try {
        await db
          .from('chat_presence')
          .delete()
          .eq('conversation_id', conversationId)
          .eq('user_id', effectiveProfileId);
        await db
          .from('typing_indicators')
          .delete()
          .eq('conversation_id', conversationId)
          .eq('user_id', effectiveProfileId);
      } catch (error) {
        // Silent fail
      }
    };

    // Initial fetch + announce "viewing" to the other user (Snapchat in-chat presence)
    prewarmDmBroadcastChannel(conversationId);
    setActivity('viewing');
    joinPresence();
    fetchActivity();

    const unsubscribeActivity = subscribeDmBroadcastActivity(conversationId, (payload) => {
      if (!isMounted) return;
      if (
        payload.userId === effectiveProfileId ||
        (authUid && payload.userId === authUid)
      ) {
        return;
      }
      lastBroadcastAtRef.current = Date.now();
      if (payload.activity === 'idle') {
        setOtherUserActivity(null);
        setIsOtherUserPresent(false);
        return;
      }
      setOtherUserActivity({
        user_id: payload.userId,
        username: payload.username || '',
        avatar_url: payload.avatarUrl ?? null,
        display_name: payload.displayName || payload.username || null,
        activity: payload.activity,
      });
      setIsOtherUserPresent(true);
    });

    // Fallback poll when broadcast silent — primary path is dmBroadcast (<100ms).
    heartbeatRef.current = setInterval(() => {
      joinPresence();
      if (Date.now() - lastBroadcastAtRef.current > 3000) {
        fetchActivity();
      }
    }, 2000);

    const channel = subscribePostgresChannel(`live-activity:${conversationId}`, [
      {
        event: '*',
        table: 'typing_indicators',
        filter: `conversation_id=eq.${conversationId}`,
        callback: () => {
          if (isMounted) fetchActivity();
        },
      },
      {
        event: '*',
        table: 'chat_presence',
        filter: `conversation_id=eq.${conversationId}`,
        callback: () => {
          if (isMounted) fetchActivity();
        },
      },
    ]);

    // Visibility change handler
    const handleVisibilityChange = () => {
      if (document.hidden) {
        leavePresence();
      } else if (isMounted) {
        joinPresence();
        fetchActivity();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isMounted = false;
      setActivity('idle');
      unsubscribeActivity();
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      leavePresence();
      removeRealtimeChannel(channel);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [conversationId, effectiveProfileId, authUid, fetchActivity, setActivity]);

  return {
    otherUserActivity,
    isOtherUserPresent,
    setActivity,
    setTyping,
    setRecordingVoice,
    setRecordingVideo,
    setTakingPhoto,
  };
}

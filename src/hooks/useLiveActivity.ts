import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';
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
  const { profile } = useAuth();
  const [otherUserActivity, setOtherUserActivity] = useState<ActivityUser | null>(null);
  const [isOtherUserPresent, setIsOtherUserPresent] = useState(false);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const activityRef = useRef<ActivityType>('idle');
  const lastActivityUpdateRef = useRef<number>(0);
  const lastBroadcastAtRef = useRef<number>(0);

  // Set my current activity - fire-and-forget (non-blocking)
  const setActivity = useCallback((activity: ActivityType) => {
    if (!conversationId || !profile?.id) return;
    
    const now = Date.now();
    if (now - lastActivityUpdateRef.current < 200 && activity === activityRef.current) return;
    lastActivityUpdateRef.current = now;
    activityRef.current = activity;

    void sendDmBroadcastActivity(conversationId, {
      userId: profile.id,
      activity,
      username: profile.username || '',
      displayName: (profile as { display_name?: string | null }).display_name || profile.username || '',
      avatarUrl: profile.avatar_url || null,
    });

    const updateActivity = async () => {
      try {
        if (activity === 'idle') {
          await db
            .from('typing_indicators')
            .delete()
            .eq('conversation_id', conversationId)
            .eq('user_id', profile.id);
        } else {
          await db
            .from('typing_indicators')
            .upsert(
              {
                conversation_id: conversationId,
                user_id: profile.id,
                started_at: new Date().toISOString(),
              },
              { onConflict: 'conversation_id,user_id', ignoreDuplicates: false }
            );
          
          await db
            .from('chat_presence')
            .upsert(
              {
                conversation_id: conversationId,
                user_id: profile.id,
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
  }, [conversationId, profile?.id]);

  // Quick helpers for specific activities
  const setTyping = useCallback((isTyping: boolean) => {
    setActivity(isTyping ? 'typing' : 'viewing');
  }, [setActivity]);

  const setRecordingVoice = useCallback((isRecording: boolean) => {
    setActivity(isRecording ? 'recording_voice' : 'idle');
  }, [setActivity]);

  const setRecordingVideo = useCallback((isRecording: boolean) => {
    setActivity(isRecording ? 'recording_video' : 'idle');
  }, [setActivity]);

  const setTakingPhoto = useCallback((isTaking: boolean) => {
    setActivity(isTaking ? 'taking_photo' : 'idle');
  }, [setActivity]);

  // Fetch other user's activity
  const fetchActivity = useCallback(async () => {
    if (!conversationId || !profile?.id) return;

    try {
      const threeSecondsAgo = new Date(Date.now() - 3000).toISOString();
      const tenSecondsAgo = new Date(Date.now() - 10000).toISOString();

      // Check typing indicators (active within 3 seconds)
      const { data: typingData } = await db
        .from('typing_indicators')
        .select(`
          user_id,
          started_at,
          profiles:user_id(id, username, avatar_url, display_name)
        `)
        .eq('conversation_id', conversationId)
        .neq('user_id', profile.id)
        .gt('started_at', threeSecondsAgo)
        .limit(1);

      // Check presence (active within 10 seconds)
      const { data: presenceData } = await db
        .from('chat_presence')
        .select(`
          user_id,
          last_seen_at,
          profiles:user_id(id, username, avatar_url, display_name)
        `)
        .eq('conversation_id', conversationId)
        .neq('user_id', profile.id)
        .gt('last_seen_at', tenSecondsAgo)
        .limit(1);

      // Determine activity state
      if (typingData && typingData.length > 0) {
        const user = typingData[0];
        const userProfile = user.profiles as any;
        setOtherUserActivity({
          user_id: user.user_id,
          username: userProfile?.username || '',
          avatar_url: userProfile?.avatar_url,
          display_name: userProfile?.display_name,
          activity: 'typing',
        });
        setIsOtherUserPresent(true);
      } else if (presenceData && presenceData.length > 0) {
        const user = presenceData[0];
        const userProfile = user.profiles as any;
        setOtherUserActivity({
          user_id: user.user_id,
          username: userProfile?.username || '',
          avatar_url: userProfile?.avatar_url,
          display_name: userProfile?.display_name,
          activity: 'viewing',
        });
        setIsOtherUserPresent(true);
      } else {
        setOtherUserActivity(null);
        setIsOtherUserPresent(false);
      }
    } catch (error) {
      // Silent fail
    }
  }, [conversationId, profile?.id]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!conversationId || !profile?.id) return;

    let isMounted = true;

    // Join presence immediately
    const joinPresence = async () => {
      if (!isMounted) return;
      try {
        await db
          .from('chat_presence')
          .upsert(
            {
              conversation_id: conversationId,
              user_id: profile.id,
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
          .eq('user_id', profile.id);
        await db
          .from('typing_indicators')
          .delete()
          .eq('conversation_id', conversationId)
          .eq('user_id', profile.id);
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
      if (payload.userId === profile.id) return;
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
      if (Date.now() - lastBroadcastAtRef.current > 4000) {
        fetchActivity();
      }
    }, 5000);

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
  }, [conversationId, profile?.id, fetchActivity, setActivity]);

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

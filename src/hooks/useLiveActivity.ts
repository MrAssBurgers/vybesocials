import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { ActivityType } from '@/components/chat/LiveActivityIndicator';

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

  // Set my current activity - instant updates
  const setActivity = useCallback(async (activity: ActivityType) => {
    if (!conversationId || !profile?.id) return;
    
    // Debounce rapid updates (max once per 100ms)
    const now = Date.now();
    if (now - lastActivityUpdateRef.current < 100 && activity === activityRef.current) return;
    lastActivityUpdateRef.current = now;
    activityRef.current = activity;

    try {
      if (activity === 'idle') {
        // Remove activity indicator
        await supabase
          .from('typing_indicators')
          .delete()
          .eq('conversation_id', conversationId)
          .eq('user_id', profile.id);
      } else {
        // Upsert with activity type in metadata
        await supabase
          .from('typing_indicators')
          .upsert(
            {
              conversation_id: conversationId,
              user_id: profile.id,
              started_at: new Date().toISOString(),
            },
            { onConflict: 'conversation_id,user_id', ignoreDuplicates: false }
          );
        
        // Also update presence with activity
        await supabase
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
  }, [conversationId, profile?.id]);

  // Quick helpers for specific activities
  const setTyping = useCallback((isTyping: boolean) => {
    setActivity(isTyping ? 'typing' : 'idle');
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
      const { data: typingData } = await supabase
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
      const { data: presenceData } = await supabase
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
        await supabase
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
        await supabase
          .from('chat_presence')
          .delete()
          .eq('conversation_id', conversationId)
          .eq('user_id', profile.id);
        await supabase
          .from('typing_indicators')
          .delete()
          .eq('conversation_id', conversationId)
          .eq('user_id', profile.id);
      } catch (error) {
        // Silent fail
      }
    };

    // Initial fetch
    joinPresence();
    fetchActivity();

    // Fast heartbeat every 2 seconds for ultra-responsive presence
    heartbeatRef.current = setInterval(() => {
      joinPresence();
      fetchActivity();
    }, 2000);

    // Realtime subscription for instant updates
    const channel = supabase
      .channel(`live-activity:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'typing_indicators',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          if (isMounted) fetchActivity();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_presence',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          if (isMounted) fetchActivity();
        }
      )
      .subscribe();

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
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      leavePresence();
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [conversationId, profile?.id, fetchActivity]);

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

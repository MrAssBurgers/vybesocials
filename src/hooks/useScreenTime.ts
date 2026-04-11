import { useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

const SESSION_INTERVAL_MS = 60_000; // Update every 60s

/**
 * Tracks screen time for the current user session.
 * Inserts/updates a row in screen_time_sessions every minute.
 */
export function useScreenTimeTracker() {
  const { user } = useAuth();
  const sessionIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startSession = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('screen_time_sessions')
      .insert({ user_id: user.id, duration_seconds: 0 })
      .select('id')
      .single();
    if (data) sessionIdRef.current = data.id;
  }, [user]);

  const updateSession = useCallback(async () => {
    if (!sessionIdRef.current) return;
    try {
      await supabase
        .from('screen_time_sessions')
        .update({ duration_seconds: 60, ended_at: new Date().toISOString() })
        .eq('id', sessionIdRef.current!);
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    startSession();
    intervalRef.current = setInterval(updateSession, SESSION_INTERVAL_MS);

    const handleVisibility = () => {
      if (document.hidden) {
        // End session
        if (sessionIdRef.current) {
          supabase
            .from('screen_time_sessions')
            .update({ ended_at: new Date().toISOString() })
            .eq('id', sessionIdRef.current)
            .then(() => {});
        }
        if (intervalRef.current) clearInterval(intervalRef.current);
      } else {
        startSession();
        intervalRef.current = setInterval(updateSession, SESSION_INTERVAL_MS);
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (sessionIdRef.current) {
        supabase
          .from('screen_time_sessions')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', sessionIdRef.current)
          .then(() => {});
      }
    };
  }, [user, startSession, updateSession]);
}

/**
 * Get today's total screen time in seconds.
 */
export function useTodayScreenTime() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['screen-time-today', user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('screen_time_sessions')
        .select('duration_seconds')
        .eq('user_id', user.id)
        .eq('session_date', today);
      
      return (data || []).reduce((sum, s) => sum + (s.duration_seconds || 0), 0);
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });
}

export function formatScreenTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

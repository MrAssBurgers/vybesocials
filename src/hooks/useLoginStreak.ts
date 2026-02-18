import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';

// Get IANA timezone string for the client
const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

interface StreakResult {
  success: boolean;
  streak: number;
  longest_streak: number;
  is_new_day?: boolean;
  streak_extended?: boolean;
  hours_remaining?: number | null;
  needs_login_today?: boolean;
  expires_at?: string;
  error?: string;
}

const STREAK_REMINDER_KEY = 'vybe_streak_reminder_shown';

/**
 * Hook to manage login streaks
 */
export function useLoginStreak() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showStreakPopup, setShowStreakPopup] = useState(false);
  const [streakData, setStreakData] = useState<StreakResult | null>(null);
  const hasTrackedRef = useRef(false);

  // Query current streak status
  const { data: streakStatus, isLoading } = useQuery({
    queryKey: ['login-streak', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_login_streak_status', { p_timezone: clientTimezone });
      if (error) throw error;
      return data as unknown as StreakResult;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Mutation to update streak
  const updateStreakMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('update_login_streak', { p_timezone: clientTimezone });
      if (error) throw error;
      return data as unknown as StreakResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['login-streak'] });
      
      // Only show popup when streak is >= 1 (2nd consecutive day or more)
      if (data.is_new_day && data.streak_extended && data.streak >= 1) {
        // Show streak popup for extending streak
        setStreakData(data);
        setShowStreakPopup(true);
        haptics.success();
      }
      // Don't show popup for streak 0 (first day or broken streak)
    },
  });

  // Track login on mount
  useEffect(() => {
    if (!user?.id || hasTrackedRef.current) return;
    
    hasTrackedRef.current = true;
    updateStreakMutation.mutate();
  }, [user?.id]);

  // Check for streak reminder (7 hours left)
  useEffect(() => {
    if (!streakStatus?.hours_remaining) return;
    
    const hoursRemaining = streakStatus.hours_remaining;
    
    // Show reminder if <= 7 hours remaining and hasn't been shown today
    if (hoursRemaining <= 7 && hoursRemaining > 0) {
      const today = new Date().toDateString();
      const lastReminder = localStorage.getItem(STREAK_REMINDER_KEY);
      
      if (lastReminder !== today) {
        localStorage.setItem(STREAK_REMINDER_KEY, today);
        
        // Schedule notification
        toast.warning(
          `🔥 Your ${streakStatus.streak}-day streak expires soon!`,
          {
            description: `Log in within ${Math.ceil(hoursRemaining)} hours to keep it going!`,
            duration: 8000,
          }
        );
      }
    }
  }, [streakStatus?.hours_remaining, streakStatus?.streak]);

  const dismissStreakPopup = useCallback(() => {
    setShowStreakPopup(false);
    setTimeout(() => setStreakData(null), 300);
  }, []);

  // Restore streak mutation (premium only)
  const restoreStreakMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('restore_login_streak', { p_timezone: clientTimezone });
      if (error) throw error;
      return data as unknown as { success: boolean; restored_streak?: number; error?: string };
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['login-streak'] });
        toast.success(`🔥 Streak restored to ${data.restored_streak} days!`);
        haptics.success();
      } else {
        toast.error(data.error || 'Could not restore streak');
      }
    },
    onError: () => {
      toast.error('Failed to restore streak');
    },
  });

  return {
    streak: streakStatus?.streak ?? 0,
    longestStreak: streakStatus?.longest_streak ?? 0,
    hoursRemaining: streakStatus?.hours_remaining ?? null,
    needsLoginToday: streakStatus?.needs_login_today ?? true,
    isLoading,
    showStreakPopup,
    streakData,
    dismissStreakPopup,
    restoreStreak: restoreStreakMutation.mutate,
    isRestoring: restoreStreakMutation.isPending,
  };
}

/**
 * Hook just for displaying streak count (lightweight)
 */
export function useStreakCount() {
  const { user } = useAuth();
  
  const { data } = useQuery({
    queryKey: ['login-streak', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_login_streak_status', { p_timezone: clientTimezone });
      if (error) throw error;
      return data as unknown as StreakResult;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5,
  });

  return data?.streak ?? 0;
}
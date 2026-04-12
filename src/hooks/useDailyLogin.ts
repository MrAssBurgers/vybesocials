import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTokenReward } from '@/hooks/useVybeTokens';

/**
 * Tracks daily login for challenges and grants streak-multiplied XP.
 * Formula: 15 XP × (1 + 0.3 × (streak - 1))
 * Day 1: 15 XP, Day 2: 19 XP, Day 5: 33 XP, Day 10: 55 XP
 */
const SESSION_KEY = 'vybe_daily_login_tracked';
const LOCAL_KEY = 'vybe_daily_login_date';

export function useDailyLoginChallenge() {
  const { profile } = useAuth();
  const triggeredRef = useRef(false);
  const queryClient = useQueryClient();
  const { rewardDailyLogin } = useTokenReward();

  useEffect(() => {
    // Guard: skip if already triggered this mount OR this session
    if (!profile?.id || triggeredRef.current) return;
    
    const today = new Date().toISOString().slice(0, 10);
    
    // Check BOTH sessionStorage AND localStorage for dedup
    const sessionTracked = sessionStorage.getItem(SESSION_KEY);
    const localTracked = localStorage.getItem(LOCAL_KEY);
    if (sessionTracked === today || localTracked === today) {
      triggeredRef.current = true;
      return;
    }
    
    const triggerLogin = async () => {
      triggeredRef.current = true;
      sessionStorage.setItem(SESSION_KEY, today);
      localStorage.setItem(LOCAL_KEY, today);
      
      try {
        const { data, error } = await supabase.rpc('track_daily_login');
        
        if (error) throw error;
        
        // Invalidate XP/level queries so the UI updates
        queryClient.invalidateQueries({ queryKey: ['user-level'] });
        queryClient.invalidateQueries({ queryKey: ['challenge-progress'] });
        
        const result = data as { success: boolean; already_logged?: boolean; xp_granted?: number; streak?: number; multiplier?: number } | null;
        
        if (result?.success && !result?.already_logged && result?.xp_granted) {
          // Also reward VYBE tokens for daily login
          rewardDailyLogin();
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[DailyLogin] Failed to track:', error);
        }
      }
    };

    triggerLogin();
  }, [profile?.id, queryClient]);
}

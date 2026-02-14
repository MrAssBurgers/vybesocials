import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/**
 * Tracks daily login for challenges and grants streak-multiplied XP.
 * Formula: 15 XP × (1 + 0.3 × (streak - 1))
 * Day 1: 15 XP, Day 2: 19 XP, Day 5: 33 XP, Day 10: 55 XP
 */
export function useDailyLoginChallenge() {
  const { profile } = useAuth();
  const triggeredRef = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profile?.id || triggeredRef.current) return;
    
    const triggerLogin = async () => {
      triggeredRef.current = true;
      
      try {
        const { data, error } = await supabase.rpc('track_daily_login');
        
        if (error) throw error;
        
        // Invalidate XP/level queries so the UI updates
        queryClient.invalidateQueries({ queryKey: ['user-level'] });
        queryClient.invalidateQueries({ queryKey: ['challenge-progress'] });
        
        const result = data as { success: boolean; already_logged?: boolean; xp_granted?: number; streak?: number; multiplier?: number } | null;
        
        if (result?.success && !result?.already_logged && result?.xp_granted) {
          const streak = result.streak || 1;
          const multiplier = result.multiplier || 1;
          
          if (streak > 1) {
            toast.success(`+${result.xp_granted} XP (${multiplier}x streak bonus) 🔥 Day ${streak}!`, { duration: 4000 });
          } else {
            toast.success(`+${result.xp_granted} XP for logging in today! 🔥`, { duration: 3000 });
          }
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

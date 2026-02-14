import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/**
 * Tracks daily login for challenges and grants +15 XP.
 * Call this once on app load to credit the user for logging in today.
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
        await supabase.rpc('track_daily_login');
        
        // Invalidate XP/level queries so the UI updates
        queryClient.invalidateQueries({ queryKey: ['user-level'] });
        queryClient.invalidateQueries({ queryKey: ['challenge-progress'] });
        
        toast.success('+15 XP for logging in today! 🔥', { duration: 3000 });
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[DailyLogin] Failed to track:', error);
        }
      }
    };

    triggerLogin();
  }, [profile?.id, queryClient]);
}

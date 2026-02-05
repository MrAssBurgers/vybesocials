import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

/**
 * Tracks daily login for challenges.
 * Call this once on app load to credit the user for logging in today.
 */
export function useDailyLoginChallenge() {
  const { profile } = useAuth();
  const triggeredRef = useRef(false);

  useEffect(() => {
    if (!profile?.id || triggeredRef.current) return;
    
    const triggerLogin = async () => {
      triggeredRef.current = true;
      
      try {
        // Call RPC to track daily login
        await supabase.rpc('track_daily_login');
        if (import.meta.env.DEV) {
          console.log('[DailyLogin] Tracked daily login');
        }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[DailyLogin] Failed to track:', error);
        }
      }
    };

    triggerLogin();
  }, [profile?.id]);
}

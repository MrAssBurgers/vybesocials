import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * After signup, poll for email confirmation so users who verify in Mail
 * return to a live session without manually signing in again.
 */
export function useEmailVerificationPoll(active: boolean, onVerified?: () => void) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const poll = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled || !session?.user?.email_confirmed_at) return;
      onVerified?.();
      toast.success('Email verified — welcome to VYBE!');
      navigate('/onboarding', { replace: true });
    };

    const interval = setInterval(poll, 4000);
    poll();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active, navigate, onVerified]);
}

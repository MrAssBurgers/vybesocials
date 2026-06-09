import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * After signup, detect email confirmation via session poll + auth events + app resume.
 */
export function useEmailVerificationPoll(active: boolean, onVerified?: () => void) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!active) return;

    let cancelled = false;

    const handleVerified = () => {
      if (cancelled) return;
      onVerified?.();
      toast.success('Email verified — welcome to VYBE!');
      navigate('/onboarding', { replace: true });
    };

    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email_confirmed_at) {
        handleVerified();
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.email_confirmed_at) {
        handleVerified();
      }
    });

    const interval = setInterval(checkSession, 4000);
    checkSession();

    const onResume = () => {
      void checkSession();
    };
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('app-resumed', onResume);
    window.addEventListener('pageshow', onResume);

    return () => {
      cancelled = true;
      clearInterval(interval);
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('app-resumed', onResume);
      window.removeEventListener('pageshow', onResume);
    };
  }, [active, navigate, onVerified]);
}

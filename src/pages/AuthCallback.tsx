import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';

/**
 * OAuth callback page. After the Lovable Cloud OAuth broker redirects here
 * with tokens in the URL hash, the Supabase client's detectSessionInUrl
 * processes them and fires onAuthStateChange → SIGNED_IN. We wait for
 * `user` to appear, then redirect to /home (or /onboarding for new users).
 *
 * This avoids the race condition in Landing.tsx where intro-checks,
 * authReady guards, and session detection all competed.
 */
export default function AuthCallback() {
  const { user, authReady, profile } = useAuth();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);

  // Safety timeout — if session never establishes after 10s, go to login
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 10000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Clean up the OAuth pending flag no matter what
    if (user || timedOut) {
      sessionStorage.removeItem('vybe-oauth-pending');
    }

    if (user) {
      // Wait for profile to decide destination
      if (profile) {
        if (profile.onboarding_completed === false || !profile.username) {
          navigate('/onboarding', { replace: true });
        } else {
          navigate('/home', { replace: true });
        }
      }
      // else: profile still loading, wait
      return;
    }

    if (timedOut) {
      // Session never established — send to login
      navigate('/', { replace: true });
    }
  }, [user, profile, timedOut, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  );
}

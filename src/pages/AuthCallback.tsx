import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { debugLog } from '@/lib/debugSessionLog';

/**
 * OAuth callback page. After the Lovable Cloud OAuth broker redirects here
 * with tokens in the URL hash, the Supabase client's detectSessionInUrl
 * processes them and fires onAuthStateChange → SIGNED_IN. We wait for
 * `user` to appear, then redirect to /home (or /onboarding for new users).
 */
export default function AuthCallback() {
  const { user, authReady, profile, loading, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);
  const profileCheckTimer = useRef<NodeJS.Timeout | null>(null);
  const [profileSettled, setProfileSettled] = useState(false);

  // If the user cancelled the OAuth flow (or the broker returned an error),
  // the URL will contain ?error=… / #error=… instead of access tokens. In that
  // case bail to the landing page immediately instead of sitting on the spinner.
  useEffect(() => {
    try {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const combined = `${hash}${search}`;
      const hasError = /(?:^|[?&#])error=/.test(hash) || /(?:^|[?&])error=/.test(search);
      const hasTokens = /access_token=|refresh_token=|code=|token_hash=/.test(combined);
      if (hasError) {
        sessionStorage.removeItem('vybe-oauth-pending');
        navigate('/', { replace: true });
        return;
      }
      if (!hasTokens) {
        sessionStorage.removeItem('vybe-oauth-pending');
        const t = setTimeout(() => {
          if (!sessionStorage.getItem('vybe-oauth-pending')) {
            navigate('/auth', { replace: true });
          }
        }, 800);
        return () => clearTimeout(t);
      }
    } catch { /* ignore */ }
  }, [navigate]);

  // Safety timeout — if session never establishes after 10s, go to login
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 10000);
    return () => clearTimeout(timer);
  }, []);

  // Once we have a user and auth is no longer loading, wait a beat for profile to load.
  // If profile is still null after 3s, treat as new user (no profile row).
  useEffect(() => {
    if (!user || loading) return;

    if (profile) {
      setProfileSettled(true);
      return;
    }

    // Give profile fetch time to complete
    profileCheckTimer.current = setTimeout(() => {
      setProfileSettled(true);
    }, 3000);

    return () => {
      if (profileCheckTimer.current) clearTimeout(profileCheckTimer.current);
    };
  }, [user, profile, loading]);

  useEffect(() => {
    if (user || timedOut) {
      sessionStorage.removeItem('vybe-oauth-pending');
    }

    if (timedOut && !user) {
      navigate('/auth', { replace: true });
      return;
    }

    if (!user || !profileSettled) return;

    let cancelled = false;
    void (async () => {
      const fresh = await refreshProfile();
      if (cancelled) return;

      // #region agent log
      debugLog('AuthCallback.tsx', 'oauth redirect check', {
        onboardingCompleted: fresh?.onboarding_completed ?? null,
        hasUsername: !!fresh?.username,
      }, 'H8', 'verify');
      // #endregion

      if (!fresh || fresh.onboarding_completed === false || !fresh.username) {
        navigate('/onboarding', { replace: true });
      } else {
        navigate('/home', { replace: true });
      }
    })();

    return () => { cancelled = true; };
  }, [user, profileSettled, timedOut, navigate, refreshProfile]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-[3px] border-primary/30 border-t-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  );
}

import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';

/**
 * OAuth callback page. After the Lovable Cloud OAuth broker redirects here
 * with tokens in the URL hash, the Supabase client's detectSessionInUrl
 * processes them and fires onAuthStateChange → SIGNED_IN. We wait for
 * `user` to appear, then redirect to /home (or /onboarding for new users).
 */
export default function AuthCallback() {
  const { user, authReady, profile, loading } = useAuth();
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
      const hasError = /(?:^|[?&#])error=/.test(hash) || /(?:^|[?&])error=/.test(search);
      const hasTokens = /access_token=|code=/.test(hash) || /code=/.test(search);
      if (hasError || !hasTokens) {
        sessionStorage.removeItem('vybe-oauth-pending');
        // Tiny delay lets Supabase's detectSessionInUrl run if tokens *are*
        // actually present and just need a tick to parse.
        const t = setTimeout(() => {
          if (!sessionStorage.getItem('vybe-oauth-pending')) {
            navigate('/', { replace: true });
          }
        }, 250);
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

  // Enforce email 2FA on OAuth sign-ins. If the user has email_2fa_enabled,
  // capture the freshly-minted OAuth session, hand it to auth-2fa-request,
  // sign the device out, and bounce to "/" where Landing opens the gate modal.
  const twoFaCheckedRef = useRef(false);
  useEffect(() => {
    if (!user || loading || twoFaCheckedRef.current) return;
    twoFaCheckedRef.current = true;
    (async () => {
      try {
        const { data: settings } = await supabase
          .from('user_2fa_settings')
          .select('email_2fa_enabled')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!settings?.email_2fa_enabled) return;

        const { data: sess } = await supabase.auth.getSession();
        const access_token = sess.session?.access_token;
        const refresh_token = sess.session?.refresh_token;
        const email = user.email;
        if (!email || !access_token || !refresh_token) return;

        const { data, error } = await supabase.functions.invoke('auth-2fa-request', {
          body: { email, oauthSession: { access_token, refresh_token } },
        });
        if (error || (data as any)?.error || !(data as any)?.challengeId) {
          // If we can't send the code, fall through and let the user in to avoid lockout.
          console.warn('OAuth 2FA gate skipped:', error || (data as any)?.error);
          return;
        }

        sessionStorage.setItem('vybe-oauth-2fa', JSON.stringify({
          email,
          challengeId: (data as any).challengeId,
          expiresAt: (data as any).expiresAt,
        }));
        await supabase.auth.signOut({ scope: 'local' } as any);
        navigate('/', { replace: true });
      } catch (e) {
        console.warn('OAuth 2FA check error', e);
      }
    })();
  }, [user, loading, navigate]);

  useEffect(() => {
    // Clean up the OAuth pending flag no matter what
    if (user || timedOut) {
      sessionStorage.removeItem('vybe-oauth-pending');
    }

    if (user && profileSettled) {
      // If we triggered the 2FA gate, AuthCallback has already navigated away.
      if (sessionStorage.getItem('vybe-oauth-2fa')) return;
      if (!profile || profile.onboarding_completed === false || !profile.username) {
        navigate('/onboarding', { replace: true });
      } else {
        navigate('/home', { replace: true });
      }
      return;
    }

    if (timedOut) {
      navigate('/', { replace: true });
    }
  }, [user, profile, profileSettled, timedOut, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-[3px] border-primary/30 border-t-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  );
}

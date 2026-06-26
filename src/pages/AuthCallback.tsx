import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { resolvePostLoginDestination } from '@/lib/authReturnPath';
import { getCachedCurrentProfile } from '@/lib/profileCache';
import { isPasswordRecoveryUrl, redirectToPasswordRecoveryPage } from '@/lib/passwordRecoveryUrl';

/**
 * OAuth callback — redirect as soon as auth user exists (profile loads in background).
 */
export default function AuthCallback() {
  const { user, authReady, profile } = useAuth();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    try {
      if (isPasswordRecoveryUrl(new URL(window.location.href))) {
        redirectToPasswordRecoveryPage();
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const hasError = /(?:^|[?&#])error=/.test(hash) || /(?:^|[?&])error=/.test(search);
      const hasTokens = /access_token=|refresh_token=|code=|token_hash=/.test(`${hash}${search}`);
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

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 6000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (user || timedOut) {
      sessionStorage.removeItem('vybe-oauth-pending');
    }

    if (timedOut && !user) {
      navigate('/auth', { replace: true });
      return;
    }

    if (!user || !authReady) return;

    const cached = getCachedCurrentProfile();
    navigate(
      resolvePostLoginDestination(
        profile ??
          (cached
            ? { onboarding_completed: cached.onboarding_completed, username: cached.username }
            : null),
      ),
      { replace: true },
    );
  }, [user, authReady, profile, timedOut, navigate]);

  return (
    <div className="min-h-screen bg-[#0B0B10] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-[3px] border-primary/30 border-t-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  );
}

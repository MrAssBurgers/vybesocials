import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { resolvePostLoginDestination } from '@/lib/authReturnPath';
import { getCachedCurrentProfile } from '@/lib/profileCache';
import { isPasswordRecoveryUrl, redirectToPasswordRecoveryPage } from '@/lib/passwordRecoveryUrl';
import {
  clearOAuthRedirectPending,
  finalizeOAuthRedirectCapture,
  getSavedOAuthReturnPath,
  isLikelyFirebaseOAuthReturnUrl,
  isOAuthRedirectInFlight,
} from '@/lib/firebase/oauthRedirect';
import { completeOAuthRedirect } from '@/services/authService';
import {
  clearDespiaOAuthPending,
  isDespiaOAuthReturnUrl,
  tryCompleteDespiaOAuthFromCurrentUrl,
} from '@/lib/despiaOAuth';
import { getFriendlyAuthError } from '@/lib/errorUtils';
import { isSafeInternalReturnPath } from '@/lib/safeNavigate';
import { authLog } from '@/lib/authLog';
import { Button } from '@/components/ui/button';

/**
 * OAuth callback — finish redirect/Despia return, wait for authReady, then navigate once.
 */
export default function AuthCallback() {
  const { user, authReady, profile } = useAuth();
  const navigate = useNavigate();
  const [timedOut, setTimedOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
    if (!isDespiaOAuthReturnUrl(window.location.href)) return;
    void tryCompleteDespiaOAuthFromCurrentUrl().then((result) => {
      if (result?.error) {
        const msg = getFriendlyAuthError(result.error);
        if (msg !== '__SUPPRESS__') setErrorMessage(msg);
      }
    });
  }, []);

  // Single redirect capture (shared promise) — do not call from multiple pages.
  useEffect(() => {
    void completeOAuthRedirect().then((captured) => {
      if (captured.error) {
        const msg = getFriendlyAuthError(captured.error);
        if (msg !== '__SUPPRESS__') setErrorMessage(msg);
        authLog('callback_redirect_error', { message: msg });
      }
    });
  }, []);

  useEffect(() => {
    try {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const hasError = /(?:^|[?&#])error=/.test(hash) || /(?:^|[?&])error=/.test(search);
      const hasLegacyTokens = /access_token=|refresh_token=|code=|token_hash=|custom_token=|id_token=/.test(
        `${hash}${search}`,
      );
      if (hasError) {
        const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
        const code = params.get('error') || 'oauth_error';
        setErrorMessage(`Sign-in failed. Error code: ${code}`);
        clearOAuthRedirectPending();
        return;
      }
      if (!hasLegacyTokens && !isLikelyFirebaseOAuthReturnUrl() && !isOAuthRedirectInFlight()) {
        const t = setTimeout(() => {
          if (!user && authReady && !isOAuthRedirectInFlight()) {
            navigate('/auth', { replace: true });
          }
        }, 4000);
        return () => clearTimeout(t);
      }
    } catch {
      /* ignore */
    }
  }, [navigate, user, authReady]);

  useEffect(() => {
    if (user || timedOut || errorMessage) return;

    const timer = setTimeout(() => {
      void (async () => {
        const captured = await finalizeOAuthRedirectCapture();
        if (captured.session?.user) return;
        if (captured.error) {
          const msg = getFriendlyAuthError(captured.error);
          if (msg !== '__SUPPRESS__') setErrorMessage(msg);
        }
        setTimedOut(true);
      })();
    }, 8000);
    return () => clearTimeout(timer);
  }, [user, timedOut, errorMessage]);

  useEffect(() => {
    if (!timedOut || user) return;

    void (async () => {
      const captured = await finalizeOAuthRedirectCapture();
      if (captured.session?.user) return;
      clearOAuthRedirectPending();
      clearDespiaOAuthPending();
      if (!errorMessage) {
        setErrorMessage('Sign-in timed out. Return to login and try again.');
      }
    })();
  }, [timedOut, user, errorMessage]);

  useEffect(() => {
    if (!authReady || !user || errorMessage) return;
    clearOAuthRedirectPending();
    clearDespiaOAuthPending();

    const saved = getSavedOAuthReturnPath();
    const cached = getCachedCurrentProfile();
    const dest =
      (isSafeInternalReturnPath(saved) &&
        saved &&
        !saved.startsWith('/auth') &&
        saved !== '/'
        ? saved
        : null) ||
      resolvePostLoginDestination(
        profile ??
          (cached
            ? { onboarding_completed: cached.onboarding_completed, username: cached.username }
            : null),
      );

    authLog('callback_navigate', { dest });
    navigate(dest, { replace: true });
  }, [user, authReady, profile, errorMessage, navigate]);

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-[#0B0B10] flex items-center justify-center px-6">
        <div className="flex flex-col items-center gap-4 max-w-sm text-center">
          <p className="text-sm text-foreground">{errorMessage}</p>
          <Button
            onClick={() => {
              clearOAuthRedirectPending();
              clearDespiaOAuthPending();
              navigate('/auth', { replace: true });
            }}
          >
            Back to sign in
          </Button>
          <a className="text-xs text-muted-foreground underline" href="https://vybehub.app/auth">
            Open vybehub.app
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B10] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-[3px] border-primary/30 border-t-primary animate-spin" />
        <p className="text-sm text-muted-foreground">
          {!authReady ? 'Restoring your session…' : 'Signing you in…'}
        </p>
      </div>
    </div>
  );
}

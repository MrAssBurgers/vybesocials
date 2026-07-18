import { useState, useEffect, useRef, useLayoutEffect, useCallback, type CSSProperties } from 'react';
import { useNavigate, useSearchParams, useLocation, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { getPostLoginPath, resolvePostLoginDestination } from '@/lib/authReturnPath';
import { getCachedCurrentProfile } from '@/lib/profileCache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Checkbox removed — using custom inline toggle for iOS compatibility
import { toast } from 'sonner';
import { getFriendlyAuthError, getUserFriendlyError, sanitizeAuthToastMessage } from '@/lib/errorUtils';
import { Eye, EyeOff, Mail } from 'lucide-react';
import { isNativeAppShell, getRuntimeOs, isDespiaRuntime } from '@/lib/despiaBridge';
import { db } from '@/lib/firebase';
import { lovable } from '@/integrations/lovable/index';
import { VYBELogo } from '@/components/ui/VYBELogo';

import { useThemeTransition } from '@/providers/ThemeTransitionProvider';
import { isInviteEntryMode } from '@/lib/referral';
import { ForgotPasswordDialog } from '@/components/auth/ForgotPasswordDialog';
import { MigrationAccountNotice } from '@/components/system/MigrationAccountNotice';
import { LoginGateModal } from '@/components/auth/LoginGateModal';
import {
  clearPendingLoginApproval,
  getPendingLoginApproval,
  LOGIN_APPROVAL_CLEARED_EVENT,
  LOGIN_APPROVAL_PENDING_EVENT,
  setPendingLoginApproval,
  shouldBlockPostLoginNavigation,
  type PendingLoginApproval,
} from '@/lib/loginApprovalGate';
import { firebaseAuth } from '@/lib/firebase/authService';
import { FounderCounter } from '@/components/growth/FounderCounter';
import { getAuthRedirectUrl } from '@/lib/authRedirect';
import { normalizeLoginEmail } from '@/lib/loginEmail';
import { getLoginCredentialErrorMessage, isInvalidLoginCredentialError } from '@/lib/loginErrors';
import { clearObsoleteAuthStorage, hasStoredAuthSession } from '@/lib/legacyAuthStorage';
import { VybeLiquidTouchOverlay } from '@/components/effects/VybeLiquidTouchOverlay';
import { VybeLiquidText } from '@/components/ui/VybeLiquidText';
import { useEmailVerificationPoll } from '@/hooks/useEmailVerificationPoll';
import {
  clearOAuthRedirectPending,
  clearStaleOAuthRedirectPending,
  finalizeOAuthRedirectCapture,
  isLikelyFirebaseOAuthReturnUrl,
  isOAuthRedirectInFlight,
} from '@/lib/firebase/oauthRedirect';
import { clearOAuthBusy, isOAuthBusy, signInWithOAuthPlatform } from '@/lib/nativeOAuth';
import {
  clearDespiaOAuthPending,
  clearStaleDespiaOAuthPending,
  getDespiaOAuthPendingProvider,
  isDespiaOAuthInFlight,
  isDespiaOAuthReturnUrl,
  resumeDespiaOAuthNoncePollIfPending,
  tryCompleteDespiaOAuthFromCurrentUrl,
} from '@/lib/despiaOAuth';
import { claimProfileAfterOAuth } from '@/lib/oauthAccountLink';
import { preloadAppleSignIn } from '@/lib/appleSignIn';
import { authLog } from '@/lib/authLog';
import { oauthTimelineLog, safeCallbackPath } from '@/lib/oauthDebugTimeline';


// Hide bottom nav on landing page + lock document scroll (auth is one-screen)
function useAuthPageShell() {
  useEffect(() => {
    document.body.classList.add('hide-bottom-nav');
    const html = document.documentElement;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.classList.remove('hide-bottom-nav');
      html.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);
}

/**
 * Scale auth content to fit the viewport without clipping.
 * Prefer CSS `zoom` over `transform: scale()` — WebKit (iOS Cap/Despia WKWebView)
 * paints the text caret in untransformed coordinates, so a parent transform puts
 * the caret left of / mid-field relative to the visual input.
 */
function useAuthScreenFit(enabled: boolean, ...deps: unknown[]) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [fieldFocused, setFieldFocused] = useState(false);
  const lastScaleRef = useRef(1);
  // iOS WebView: visualViewport height wobbles during rubber-band / keyboard —
  // using it for live scale made the entire auth card crawl. Prefer stable layout height.
  const calmIos = isNativeAppShell() || (typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent));

  const fitToViewport = useCallback(() => {
    const el = contentRef.current;
    if (!el || !enabled) {
      if (lastScaleRef.current !== 1) {
        lastScaleRef.current = 1;
        setScale(1);
      }
      return;
    }

    // Measure natural size without the current zoom/fit.
    const prevZoom = el.style.zoom;
    const prevTransform = el.style.transform;
    el.style.zoom = '1';
    el.style.transform = 'none';
    const naturalHeight = el.getBoundingClientRect().height;
    el.style.zoom = prevZoom;
    el.style.transform = prevTransform;
    if (!naturalHeight) return;

    const viewportHeight = calmIos
      ? window.innerHeight
      : (window.visualViewport?.height ?? window.innerHeight);
    const available = Math.max(280, viewportHeight - 16);
    const nextScale = naturalHeight > available ? Math.min(1, available / naturalHeight) : 1;
    // Ignore sub-pixel thrash from soft keyboard / bounce.
    if (Math.abs(nextScale - lastScaleRef.current) < 0.02) return;
    lastScaleRef.current = nextScale;
    setScale(nextScale);
  }, [enabled, calmIos]);

  useLayoutEffect(() => {
    if (!enabled) {
      lastScaleRef.current = 1;
      setScale(1);
      return;
    }

    fitToViewport();
    const raf = requestAnimationFrame(fitToViewport);
    const afterMotion = window.setTimeout(fitToViewport, 400);

    window.addEventListener('resize', fitToViewport);
    window.addEventListener('orientationchange', fitToViewport);
    // Skip visualViewport on iOS native — it fires constantly while typing/overscrolling.
    if (!calmIos) {
      window.visualViewport?.addEventListener('resize', fitToViewport);
    }

    const observer = new ResizeObserver(fitToViewport);
    const el = contentRef.current;
    if (el) observer.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(afterMotion);
      window.removeEventListener('resize', fitToViewport);
      window.removeEventListener('orientationchange', fitToViewport);
      if (!calmIos) {
        window.visualViewport?.removeEventListener('resize', fitToViewport);
      }
      observer.disconnect();
    };
  }, [enabled, fitToViewport, calmIos, ...deps]);

  // While typing, force 1× so caret + soft keyboard never fight a shrink fit.
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !enabled) {
      setFieldFocused(false);
      return;
    }
    const isField = (node: EventTarget | null) => {
      if (!(node instanceof HTMLElement)) return false;
      const tag = node.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.isContentEditable;
    };
    const onFocusIn = (e: FocusEvent) => {
      if (isField(e.target)) setFieldFocused(true);
    };
    const onFocusOut = () => {
      requestAnimationFrame(() => {
        if (!isField(document.activeElement) || !el.contains(document.activeElement)) {
          setFieldFocused(false);
        }
      });
    };
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('focusout', onFocusOut);
    return () => {
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
    };
  }, [enabled, ...deps]);

  // Apply shrink only when not focused. Never use transform (WebKit caret bug).
  const visualScale = fieldFocused ? 1 : scale;
  return { contentRef, scale: visualScale, scrollWhenTall: calmIos || fieldFocused };
}

// Invite mode stage type - shared between invite flow components
export type InviteStage = 'landing' | 'complete-profile' | 'onboarding' | 'home';

interface LandingProps {
  onInviteNavigate?: (stage: InviteStage) => void;
  isInviteMode?: boolean;
}

export default function Landing({ onInviteNavigate, isInviteMode = false }: LandingProps) {
  const { t } = useTranslation();
  const { user, signIn, signUp, resendVerification, authReady, profile, applyOAuthSession, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { triggerTransition } = useThemeTransition();
  
  // Hide bottom nav + lock page scroll while on auth screen
  useAuthPageShell();
  
  // Check URL params for mode (login vs signup) and intro reset
  const modeParam = searchParams.get('mode');
  const pathLower = (typeof window !== 'undefined' ? window.location.pathname : '').toLowerCase();
  const pathSaysSignup = pathLower.includes('signup') || pathLower.includes('sign-up');
  const pathSaysLogin = pathLower.includes('login') || pathLower.includes('signin') || pathLower.includes('sign-in');
  const [isLogin, setIsLogin] = useState(() => {
    return pathSaysSignup ? false :
    pathSaysLogin ? true :
    modeParam === 'login' || searchParams.get('signup') !== 'true';
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Detect OAuth return: hash tokens OR Firebase redirect flag.
  // Despia hc=/nonce must NOT flip isOAuthReturn — that full-screens "Completing…"
  // and sticks after App Link remount. Despia uses the chip overlay + tryComplete instead.
  const [isOAuthReturn, setIsOAuthReturn] = useState(() => {
    const hash = window.location.hash;
    const hasHashTokens = hash.includes('access_token') || hash.includes('refresh_token');
    return hasHashTokens || isOAuthRedirectInFlight() || isLikelyFirebaseOAuthReturnUrl();
  });
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [loginGate, setLoginGate] = useState<null | {
    mode: 'code' | 'approval';
    email: string;
    challengeId: string;
    expiresAt?: string;
    approvalDevice?: string;
    approvalLocation?: { city?: string | null; country?: string | null; ip?: string | null };
  }>(() => {
    const pending = getPendingLoginApproval();
    if (!pending) return null;
    return {
      mode: 'approval',
      email: pending.email || '',
      challengeId: pending.challengeId,
      expiresAt: pending.expiresAt,
      approvalDevice: pending.deviceLabel,
      approvalLocation: pending.location,
    };
  });

  const openLoginApprovalGate = useCallback((pending: PendingLoginApproval, fallbackEmail = '') => {
    setPendingLoginApproval(pending);
    setLoginGate({
      mode: 'approval',
      email: pending.email || fallbackEmail,
      challengeId: pending.challengeId,
      expiresAt: pending.expiresAt,
      approvalDevice: pending.deviceLabel,
      approvalLocation: pending.location,
    });
  }, []);

  useEffect(() => {
    const sync = () => {
      const pending = getPendingLoginApproval();
      if (!pending) {
        setLoginGate((cur) => (cur?.mode === 'approval' ? null : cur));
        return;
      }
      setLoginGate({
        mode: 'approval',
        email: pending.email || '',
        challengeId: pending.challengeId,
        expiresAt: pending.expiresAt,
        approvalDevice: pending.deviceLabel,
        approvalLocation: pending.location,
      });
    };
    window.addEventListener(LOGIN_APPROVAL_PENDING_EVENT, sync);
    window.addEventListener(LOGIN_APPROVAL_CLEARED_EVENT, sync);
    return () => {
      window.removeEventListener(LOGIN_APPROVAL_PENDING_EVENT, sync);
      window.removeEventListener(LOGIN_APPROVAL_CLEARED_EVENT, sync);
    };
  }, []);
  const [awaitingEmailVerification, setAwaitingEmailVerification] = useState(false);
  useEmailVerificationPoll(awaitingEmailVerification, () => setAwaitingEmailVerification(false));
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: '',
  });
  /** Full-screen signing overlay while system sheet / Apple sheet is open. */
  const [oauthOverlay, setOauthOverlay] = useState<'google' | 'apple' | null>(null);

  const hasStoredSession = hasStoredAuthSession();

  const showAuthForm =
    isInviteMode ||
    (!user && !loginGate && (!hasStoredSession || authReady));

  useEffect(() => {
    clearStaleOAuthRedirectPending();
    clearStaleDespiaOAuthPending();
    // [iOS-only] Never preload Apple JS in Despia — oauth:// only; JS usePopup yields opaque "unknown".
    if (!isDespiaRuntime()) {
      preloadAppleSignIn();
    }
    // Resume chip only — do NOT set isOAuthReturn (that full-screens "Completing…" forever).
    if (isDespiaOAuthInFlight()) {
      const provider = getDespiaOAuthPendingProvider();
      if (provider) {
        setOauthOverlay(provider);
        setLoading(true);
      }
      resumeDespiaOAuthNoncePollIfPending();
    }
  }, []);

  // Complete Despia oauth:// return (deeplink / window.url with hc=).
  useEffect(() => {
    let finishing = false;
    const finishDespiaOAuth = async (detail?: {
      error?: { message?: string; name?: string } | null;
      data?: { session?: Parameters<typeof applyOAuthSession>[0] | null };
    }) => {
      if (finishing) return;
      if (detail?.data?.session?.user) {
        finishing = true;
        clearDespiaOAuthPending();
        clearOAuthRedirectPending();
        clearOAuthBusy();
        const gate = await applyOAuthSession(detail.data.session);
        setOauthOverlay(null);
        setLoading(false);
        setIsOAuthReturn(false);
        if (gate.requiresApproval && gate.challengeId) {
          openLoginApprovalGate({
            challengeId: gate.challengeId,
            expiresAt: gate.expiresAt,
            deviceLabel: gate.deviceLabel,
            location: gate.geo,
            email: detail.data.session.user.email || undefined,
          });
          return;
        }
        const cached = getCachedCurrentProfile();
        const dest = resolvePostLoginDestination(
          profile ??
            (cached
              ? { onboarding_completed: cached.onboarding_completed, username: cached.username }
              : null),
        );
        // Navigate + clear overlay immediately; claim/refresh warm home in background.
        navigate(dest, { replace: true });
        toast.success('Welcome back! ✨');
        void (async () => {
          try {
            await claimProfileAfterOAuth();
          } catch {
            /* ignore */
          }
          try {
            await refreshProfile();
          } catch {
            /* ignore */
          }
          try {
            const qc = (window as unknown as { __REACT_QUERY_CLIENT__?: { invalidateQueries: (opts: object) => void } })
              .__REACT_QUERY_CLIENT__;
            qc?.invalidateQueries({ refetchType: 'active' });
          } catch {
            /* optional */
          }
        })();
        return;
      }

      // Soft-close / incomplete handoff — keep nonce poll; do not clear pending.
      if (!detail?.error && !detail?.data?.session?.user) {
        return;
      }

      // Always clear the chip — empty complete / cancel must not leave endless loading.
      // Exception: "already used" race — sibling App Link/poll completion may still succeed.
      if (
        detail?.error?.message &&
        /already used|expired or already used/i.test(detail.error.message)
      ) {
        return;
      }

      clearDespiaOAuthPending();
      clearOAuthRedirectPending();
      clearOAuthBusy();
      setOauthOverlay(null);
      setLoading(false);
      setIsOAuthReturn(false);

      if (detail?.error?.message) {
        const msg = sanitizeAuthToastMessage(getFriendlyAuthError(detail.error));
        if (msg !== '__SUPPRESS__') {
          sessionStorage.setItem('vybe-oauth-error', msg);
          toast.error(msg);
        }
      }
    };

    void tryCompleteDespiaOAuthFromCurrentUrl().then((result) => {
      if (result) finishDespiaOAuth(result);
      else if (isDespiaOAuthInFlight()) {
        const provider = getDespiaOAuthPendingProvider();
        if (provider) {
          setOauthOverlay(provider);
          setLoading(true);
        }
      }
    });

    const onComplete = (event: Event) => {
      finishDespiaOAuth((event as CustomEvent).detail);
    };
    window.addEventListener('despia-oauth-complete', onComplete);

    // Despia closes ASWeb then navigates WebView to /auth?hc=… or ?nonce=&wait=1
    const onUrlMaybeChanged = () => {
      if (!isDespiaOAuthInFlight() && !isDespiaOAuthReturnUrl(window.location.href)) return;
      void tryCompleteDespiaOAuthFromCurrentUrl().then((result) => {
        if (result) finishDespiaOAuth(result);
        else if (isDespiaOAuthInFlight()) {
          const provider = getDespiaOAuthPendingProvider();
          // Do not re-cover the UI after ASWeb dismiss (visibility visible) —
          // full-screen Apple overlay left users staring at a spinner for seconds.
          if (provider && document.visibilityState !== 'visible') {
            setOauthOverlay(provider);
            setLoading(true);
          }
        }
      });
    };
    window.addEventListener('popstate', onUrlMaybeChanged);
    window.addEventListener('hashchange', onUrlMaybeChanged);
    window.addEventListener('pageshow', onUrlMaybeChanged);
    window.addEventListener('focus', onUrlMaybeChanged);
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      // #region agent log
      oauthTimelineLog(
        'app_resume_oauth',
        {
          os: getRuntimeOs(),
          despia: isDespiaRuntime(),
          inFlight: isDespiaOAuthInFlight(),
          pendingProvider: getDespiaOAuthPendingProvider() || '',
          hrefPath: safeCallbackPath(window.location.href),
          isReturnUrl: isDespiaOAuthReturnUrl(window.location.href),
        },
        'Landing.tsx:onVisible',
      );
      // #endregion
      resumeDespiaOAuthNoncePollIfPending();
      onUrlMaybeChanged();
      // Sheet dismissed — if Firebase already has a user from a background poll, finish now.
      // Else drop the chip so Apple/Google can be tapped again while nonce poll continues.
      if (isDespiaOAuthInFlight()) {
        void import('@/lib/firebase').then(async ({ firebaseAuth }) => {
          try {
            if (firebaseAuth.auth?.currentUser) {
              const { data } = await firebaseAuth.getSession();
              if (data.session?.user) {
                finishDespiaOAuth({ data: { session: data.session }, error: null });
                return;
              }
            }
          } catch {
            /* ignore */
          }
          // Unlock UI after ASWeb Done / invalid-address dismiss — do not clear pending.
          clearOAuthBusy();
          setOauthOverlay(null);
          setLoading(false);
        });
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    const poll = window.setInterval(onUrlMaybeChanged, 250);

    return () => {
      window.removeEventListener('despia-oauth-complete', onComplete);
      window.removeEventListener('popstate', onUrlMaybeChanged);
      window.removeEventListener('hashchange', onUrlMaybeChanged);
      window.removeEventListener('pageshow', onUrlMaybeChanged);
      window.removeEventListener('focus', onUrlMaybeChanged);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(poll);
    };
  }, [navigate, profile, applyOAuthSession, refreshProfile]);

  // Never leave the login chip spinning forever if the system sheet dies.
  useEffect(() => {
    if (!oauthOverlay) return;
    const started = Date.now();
    const timer = window.setTimeout(() => {
      if (Date.now() - started < 40_000) return;
      clearDespiaOAuthPending();
      clearOAuthRedirectPending();
      clearOAuthBusy();
      setOauthOverlay(null);
      setLoading(false);
      setIsOAuthReturn(false);
      toast.error('Sign-in took too long. Close any leftover browser sheet and try again.');
    }, 45_000);
    return () => window.clearTimeout(timer);
  }, [oauthOverlay]);

  // Full-screen "Completing…" is Firebase redirect only — cancel must clear Despia too.
  // (Despia pending uses the light chip, not this screen.)
  const { contentRef, scale, scrollWhenTall } = useAuthScreenFit(
    showAuthForm && !isOAuthReturn,
    isLogin,
    loading,
    agreedToTerms,
  );

  const runOAuthSignIn = useCallback(async (provider: 'google' | 'apple') => {
    // Stuck Google sheet (invalid address / Done) leaves overlay+pending true and
    // blocks Apple. Abandon prior pending when starting a different provider.
    const pendingProvider = getDespiaOAuthPendingProvider();
    if (
      (loading || isOAuthBusy() || isDespiaOAuthInFlight()) &&
      pendingProvider &&
      pendingProvider !== provider
    ) {
      clearDespiaOAuthPending();
      clearOAuthRedirectPending();
      clearOAuthBusy();
      setOauthOverlay(null);
      setLoading(false);
      setIsOAuthReturn(false);
    } else if (isOAuthBusy() || loading) {
      return;
    }
    // #region agent log
    oauthTimelineLog(
      'oauth_tap',
      {
        provider,
        os: getRuntimeOs(),
        despia: isDespiaRuntime(),
        source: 'Landing.runOAuthSignIn',
      },
      'Landing.tsx:runOAuthSignIn',
    );
    // #endregion
    setLoading(true);
    setOauthOverlay(provider);
    try {
      sessionStorage.removeItem('vybe-oauth-error');

      const oauthResult = await signInWithOAuthPlatform(provider);
      if (oauthResult.redirected) {
        setIsOAuthReturn(true);
        return;
      }
      if (oauthResult.pending) {
        // Despia system sheet — stay on login with chip. Never flip isOAuthReturn
        // (that replaces the whole page with "Completing sign-in…" forever).
        return;
      }
      if (oauthResult.error) throw oauthResult.error;

      if (oauthResult.data.session?.user) {
        const gate = await applyOAuthSession(oauthResult.data.session);
        clearOAuthRedirectPending();
        clearDespiaOAuthPending();
        clearOAuthBusy();
        if (gate.requiresApproval && gate.challengeId) {
          openLoginApprovalGate({
            challengeId: gate.challengeId,
            expiresAt: gate.expiresAt,
            deviceLabel: gate.deviceLabel,
            location: gate.geo,
            email: oauthResult.data.session.user.email || undefined,
          });
          setOauthOverlay(null);
          return;
        }
        await claimProfileAfterOAuth();
        toast.success('Welcome back! ✨');
        const cached = getCachedCurrentProfile();
        navigate(
          resolvePostLoginDestination(
            cached
              ? { onboarding_completed: cached.onboarding_completed, username: cached.username }
              : profile,
          ),
          { replace: true },
        );
        setOauthOverlay(null);
        return;
      }
    } catch (error: unknown) {
      clearOAuthRedirectPending();
      clearDespiaOAuthPending();
      clearOAuthBusy();
      const raw = error as { code?: string; name?: string; message?: string };
      const rawCode = String(raw?.code || raw?.name || '');
      const rawMessage = String(raw?.message || '');
      // Log exact Firebase/OAuth code+message BEFORE friendly mapping.
      authLog('landing_oauth_error', { code: rawCode, message: rawMessage.slice(0, 200) });
      oauthTimelineLog(
        'oauth_error',
        {
          code: rawCode.slice(0, 80),
          msg: rawMessage.slice(0, 120),
          os: getRuntimeOs(),
          despia: isDespiaRuntime(),
        },
        'Landing.tsx:runOAuthSignIn.catch',
      );
      const msg = sanitizeAuthToastMessage(getFriendlyAuthError(error));
      if (msg !== '__SUPPRESS__') toast.error(msg);
      setOauthOverlay(null);
    } finally {
      if (!isOAuthRedirectInFlight() && !isDespiaOAuthInFlight()) {
        setLoading(false);
        setOauthOverlay(null);
        clearOAuthBusy();
      }
    }
  }, [navigate, profile, applyOAuthSession, loading, openLoginApprovalGate]);

  // Firebase OAuth redirect — navigate as soon as session exists.
  useEffect(() => {
    if (!isOAuthReturn) return;

    if (user) {
      if (shouldBlockPostLoginNavigation() || loginGate) {
        return;
      }
      clearOAuthRedirectPending();
      clearDespiaOAuthPending();
      sessionStorage.removeItem('vybe-oauth-error');
      setIsOAuthReturn(false);
      setOauthOverlay(null);
      setLoading(false);
      void claimProfileAfterOAuth().then(() => {
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
      });
      return;
    }

    const oauthError = sessionStorage.getItem('vybe-oauth-error');
    if (oauthError && authReady) {
      clearOAuthRedirectPending();
      clearDespiaOAuthPending();
      sessionStorage.removeItem('vybe-oauth-error');
      setIsOAuthReturn(false);
      setLoading(false);
      setOauthOverlay(null);
      const msg = sanitizeAuthToastMessage(oauthError);
      toast.error(msg);
      return;
    }

    const failTimer = setTimeout(() => {
      void (async () => {
        const captured = await finalizeOAuthRedirectCapture();
        if (captured.session?.user) {
          const gate = await applyOAuthSession(captured.session);
          if (gate.requiresApproval && gate.challengeId) {
            openLoginApprovalGate({
              challengeId: gate.challengeId,
              expiresAt: gate.expiresAt,
              deviceLabel: gate.deviceLabel,
              location: gate.geo,
              email: captured.session.user.email || undefined,
            });
            setIsOAuthReturn(false);
            setOauthOverlay(null);
            setLoading(false);
            return;
          }
          await claimProfileAfterOAuth();
          setOauthOverlay(null);
          return;
        }
        clearOAuthRedirectPending();
        clearDespiaOAuthPending();
        setIsOAuthReturn(false);
        setLoading(false);
        setOauthOverlay(null);
        const msg = sanitizeAuthToastMessage(
          captured.error
            ? getFriendlyAuthError(captured.error)
            : 'Sign-in did not complete. Please try again.',
        );
        if (msg !== '__SUPPRESS__') toast.error(msg);
      })();
    }, 18000);

    return () => clearTimeout(failTimer);
  }, [isOAuthReturn, user, authReady, navigate, applyOAuthSession]);

  // Redirect if already logged in AND has completed onboarding
  // First-time users (even if authenticated) should see intro if not completed
  // IMPORTANT: Don't redirect if user entered via invite link - let them complete the flow
  // When isInviteMode=true, this component is rendered inline from InviteRedeem
  const location = useLocation();
  const isInviteRoute = location.pathname.startsWith('/invite/');

  // Spinner only while restoring an existing session — logged-out users see the form immediately.
  if (!isInviteMode && !authReady && hasStoredSession && !isOAuthReturn) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0B0B10] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-[3px] border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  // OAuth redirect in flight — keep spinner until session hydrates (avoids login loop).
  if (!isInviteMode && isOAuthReturn && !user) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0B0B10] flex flex-col items-center justify-center gap-4 px-6">
        <div className="w-8 h-8 rounded-full border-[3px] border-primary/30 border-t-primary animate-spin" />
        <p className="text-sm text-muted-foreground text-center">Completing sign-in…</p>
        <Button
          type="button"
          variant="secondary"
          className="rounded-full"
          onClick={() => {
            clearOAuthRedirectPending();
            clearDespiaOAuthPending();
            setIsOAuthReturn(false);
            setLoading(false);
            setOauthOverlay(null);
          }}
        >
          Cancel
        </Button>
      </div>
    );
  }

  if (
    !isInviteMode &&
    authReady &&
    user &&
    !loginGate &&
    !shouldBlockPostLoginNavigation() &&
    !isInviteRoute &&
    !isInviteEntryMode()
  ) {
    return <Navigate to={resolvePostLoginDestination(profile)} replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLogin && !agreedToTerms) {
      toast.error('Please agree to the Terms of Use and Privacy Policy to create an account.');
      return;
    }
    setLoading(true);

    // Helper function for navigation - uses callback in invite mode
    const navTo = (stage: InviteStage, fallbackPath: string) => {
      if (isInviteMode && onInviteNavigate) {
        onInviteNavigate(stage);
      } else {
        navigate(stage === 'home' ? getPostLoginPath(fallbackPath) : fallbackPath);
      }
    };

    try {
      if (isLogin) {
        const createHandledLoginError = (message: string) => {
          const err = new Error(message) as Error & { isHandledLoginError?: boolean };
          err.isHandledLoginError = true;
          return err;
        };

        // Auto-detect: email → Firebase directly; username → resolve via authQr then sign in.
        const { error, requiresApproval, challengeId, expiresAt, deviceLabel, geo } = await signIn(
          formData.email,
          formData.password,
        );

        if (error) {
          if (isInvalidLoginCredentialError(error)) {
            clearObsoleteAuthStorage();
            throw createHandledLoginError(getLoginCredentialErrorMessage());
          }
          throw error;
        }

        if (requiresApproval && challengeId) {
          openLoginApprovalGate(
            {
              challengeId,
              expiresAt,
              email: formData.email,
              deviceLabel,
              location: geo,
            },
            formData.email,
          );
          return;
        }

        sessionStorage.removeItem('vybe-session-only');
        clearObsoleteAuthStorage();
        toast.success('Welcome back! ✨');
        const cached = getCachedCurrentProfile();
        navigate(
          resolvePostLoginDestination(
            cached
              ? { onboarding_completed: cached.onboarding_completed, username: cached.username }
              : profile,
          ),
          { replace: true },
        );
      } else {
        if (!formData.username.trim()) {
          throw new Error('Username is required');
        }
        if (formData.password.length < 6) {
          throw new Error('Password must be at least 6 characters.');
        }
        if (!agreedToTerms) {
          throw new Error('You must agree to the Terms of Use');
        }
        const { error, needsEmailConfirmation } = await signUp(
          normalizeLoginEmail(formData.email),
          formData.password,
          formData.username,
        );
        if (error) {
          throw error;
        }

        if (needsEmailConfirmation) {
          setAwaitingEmailVerification(true);
          toast.success('Account created! Verify your email to continue.');
          return;
        }

        toast.success('Welcome to VYBE! 🎉');
        navTo('onboarding', '/onboarding');
      }
    } catch (error: any) {
      const message = error?.isHandledLoginError ? error.message : getUserFriendlyError(error);
      const rawMsg = String(error?.message || '');
      const isUnconfirmed = rawMsg.includes('Email not confirmed') || error?.code === 'email_not_confirmed';
      if (message !== '__SUPPRESS__') {
        if (isUnconfirmed && formData.email) {
          toast.error(message, {
            action: {
              label: 'Resend',
              onClick: async () => {
                const { error: resendErr } = await resendVerification(formData.email);
                if (resendErr) toast.error(getUserFriendlyError(resendErr));
                else toast.success('Verification email sent — check your inbox.');
              },
            },
            duration: 8000,
          });
        } else if (isLogin && (error?.isHandledLoginError || isInvalidLoginCredentialError(error))) {
          toast.error(message, {
            duration: 10000,
            action: {
              label: 'Forgot password',
              onClick: () => setShowForgotPassword(true),
            },
          });
        } else {
          toast.error(message);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGuestBrowse = () => {
    // Navigate to home without signing in - guest mode
    if (isInviteMode && onInviteNavigate) {
      onInviteNavigate('home');
    } else {
      navigate('/home');
    }
  };

  const authPageTitle = isLogin ? 'Welcome back' : 'Join VYBE';
  const authSubtitle = isLogin
    ? 'Sign in to pick up where you left off.'
    : 'Create your account and make it yours.';

  const footerLinks = [
    { href: '/features', label: 'Features' },
    { href: '/safety', label: 'Safety' },
    { href: '/faq', label: 'FAQ' },
    { href: '/blog', label: 'Blog' },
    { href: '/about', label: 'About' },
    { href: '/contact', label: 'Contact' },
    { href: '/privacy', label: 'Privacy' },
    { href: '/terms', label: 'Terms' },
    { href: '/cookies', label: 'Cookies' },
    { href: '/child-safety', label: 'Child Safety' },
    { href: '/guidelines', label: 'Guidelines' },
    { href: '/delete-account', label: 'Delete account' },
  ] as const;

  return (
    <div
      data-auth-shell
      className={`fixed inset-0 z-50 overscroll-none flex items-center justify-center px-3 sm:px-4 ${
        scrollWhenTall ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden'
      }`}
    >
      {!user && typeof window !== 'undefined' && !isNativeAppShell() && (
        <button
          type="button"
          onClick={() => navigate('/vybe-home')}
          className="fixed top-[max(0.5rem,var(--sat,0px))] left-[var(--app-gutter-x,max(0.5rem,env(safe-area-inset-left,0px)))] z-30 flex items-center gap-1 px-2.5 py-1 rounded-full bg-background/70 hover:bg-background/90 border border-white/10 text-[11px] text-foreground/80 hover:text-foreground backdrop-blur-md transition"
          aria-label="Back to home"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          Home
        </button>
      )}


      <div
        ref={contentRef}
        data-auth-fit
        style={
          scale < 1
            ? ({ zoom: scale } as CSSProperties)
            : undefined
        }
        className="relative z-10 w-full max-w-[400px] mx-auto flex flex-col gap-2 sm:gap-2.5 my-auto py-2"
      >
        <p className="text-center text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/75 leading-tight px-1 shrink-0">
          The Social Platform for Real Connection
        </p>

        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="w-full shrink-0"
        >
          <div className="liquid-glass-card rounded-2xl border border-white/[0.08] shadow-[0_16px_48px_-20px_rgba(0,0,0,0.5)] overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-white/[0.06] bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="relative shrink-0">
                  <div
                    className="absolute -inset-2 rounded-full opacity-35 pointer-events-none"
                    style={{
                      background: 'radial-gradient(circle, hsl(var(--primary) / 0.5) 0%, transparent 70%)',
                      filter: 'blur(10px)',
                    }}
                  />
                  <VYBELogo size="sm" showText={false} className="relative z-10" />
                </div>
                <div className="min-w-0 text-left">
                  <VybeLiquidText
                    as="h1"
                    className="text-base sm:text-lg font-display font-bold leading-tight"
                  >
                    {authPageTitle}
                  </VybeLiquidText>
                  <p className="text-[11px] sm:text-xs text-muted-foreground leading-snug mt-0.5">
                    {authSubtitle}
                  </p>
                </div>
              </div>
            </div>

            <div className="px-4 sm:px-5 py-3.5 space-y-2.5">
              {awaitingEmailVerification ? (
                <div className="space-y-3 text-center py-1">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-primary/15">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Check your email</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                      We sent a verification link to{' '}
                      <span className="text-foreground font-medium">{formData.email}</span>.
                      Open it to activate your account — check spam and promotions too.
                    </p>
                    <p className="text-[10px] text-muted-foreground/80">
                      This screen updates automatically once you verify.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-9 text-sm border-white/10"
                    disabled={loading}
                    onClick={async () => {
                      setLoading(true);
                      try {
                        const { error: resendErr } = await resendVerification(formData.email);
                        if (resendErr) throw resendErr;
                        toast.success('Verification email sent — check your inbox.');
                      } catch (err: any) {
                        toast.error(getUserFriendlyError(err));
                      } finally {
                        setLoading(false);
                      }
                    }}
                  >
                    Resend verification email
                  </Button>
                  <button
                    type="button"
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => {
                      setAwaitingEmailVerification(false);
                      setIsLogin(true);
                    }}
                  >
                    Already verified? Sign in
                  </button>
                </div>
              ) : (
              <>
              {isLogin && (
                <MigrationAccountNotice
                  variant="auth"
                  onForgotPassword={() => setShowForgotPassword(true)}
                />
              )}
              <form onSubmit={handleSubmit} className="space-y-2">
                {!isLogin && (
                  <div className="space-y-1 animate-in fade-in duration-200">
                    <Label htmlFor="username" className="text-[11px] font-medium text-muted-foreground">
                      {t('auth.username')}
                    </Label>
                    <Input
                      id="username"
                      placeholder="Choose a username"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="h-9 bg-secondary/40 border-white/10 text-sm py-1"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <Label htmlFor="email" className="text-[11px] font-medium text-muted-foreground">
                    {isLogin ? 'Email or username' : t('auth.email')}
                  </Label>
                  <Input
                    id="email"
                    type={isLogin ? 'text' : 'email'}
                    inputMode={isLogin ? 'text' : 'email'}
                    autoComplete={isLogin ? 'username' : 'email'}
                    autoCapitalize={isLogin ? 'none' : undefined}
                    autoCorrect={isLogin ? 'off' : undefined}
                    spellCheck={isLogin ? false : undefined}
                    placeholder={isLogin ? 'email or username' : 'you@email.com'}
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="h-9 bg-secondary/40 border-white/10 text-sm py-1"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="password" className="text-[11px] font-medium text-muted-foreground">
                    {t('auth.password')}
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="h-9 bg-secondary/40 border-white/10 pr-9 text-sm py-1"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <AnimatePresence>
                  {isLogin && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center justify-between gap-3 pt-0.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          id="remember"
                          role="checkbox"
                          aria-checked={rememberMe}
                          data-themed-svg
                          onClick={() => setRememberMe(!rememberMe)}
                          className="shrink-0 rounded-[3px] border transition-colors flex items-center justify-center"
                          style={{
                            WebkitAppearance: 'none',
                            appearance: 'none',
                            fontSize: 0,
                            width: '15px',
                            height: '15px',
                            minWidth: '15px',
                            minHeight: '15px',
                            padding: 0,
                            backgroundColor: rememberMe ? 'hsl(var(--primary))' : 'transparent',
                            borderColor: rememberMe ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.45)',
                          }}
                        >
                          {rememberMe && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                        <label htmlFor="remember" className="text-xs text-muted-foreground">
                          Remember me
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowForgotPassword(true)}
                        className="text-xs text-primary hover:underline shrink-0"
                      >
                        Forgot password?
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>

                <AnimatePresence>
                  {!isLogin && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-start gap-2 rounded-lg bg-secondary/15 border border-white/[0.05] px-2.5 py-2"
                    >
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={agreedToTerms}
                        aria-label="I agree to the Terms of Service and Privacy Policy"
                        data-themed-svg
                        onClick={() => setAgreedToTerms(!agreedToTerms)}
                        className="shrink-0 rounded-full border transition-colors flex items-center justify-center mt-0.5"
                        style={{
                          WebkitAppearance: 'none',
                          appearance: 'none',
                          fontSize: 0,
                          width: '16px',
                          height: '16px',
                          minWidth: '16px',
                          minHeight: '16px',
                          padding: 0,
                          backgroundColor: agreedToTerms ? 'hsl(var(--primary))' : 'transparent',
                          borderColor: agreedToTerms ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.45)',
                        }}
                      >
                        {agreedToTerms && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                      <span className="text-[11px] text-muted-foreground leading-snug">
                        I agree to the{' '}
                        <a href="/terms" target="_blank" rel="noreferrer" className="text-primary hover:underline">Terms of Use</a>
                        {' '}and{' '}
                        <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary hover:underline">Privacy Policy</a>
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>

                <Button
                  type="submit"
                  variant="vybeLiquid"
                  className="w-full h-9 text-sm"
                  disabled={loading || (!isLogin && !agreedToTerms)}
                >
                  <AnimatePresence mode="wait" initial={false}>
                    {loading ? (
                      <motion.div
                        key="loading"
                        data-allow-animation="true"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex items-center justify-center gap-1.5"
                      >
                        {[0, 0.15, 0.3].map((delay, i) => (
                          <motion.span
                            key={i}
                            className="block h-1.5 w-1.5 rounded-full bg-white/90"
                            animate={{ y: [0, -3, 0], opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 0.9, repeat: Infinity, ease: 'easeInOut', delay }}
                          />
                        ))}
                      </motion.div>
                    ) : (
                      <motion.span
                        key="label"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        {isLogin ? t('auth.login') : t('auth.signup')}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Button>
              </form>

              <div className="relative py-0.5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/[0.08]" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-card px-2 text-[9px] uppercase tracking-wider text-muted-foreground">
                    {t('auth.continueWith')}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-8 bg-secondary/20 border-white/10 hover:bg-secondary/35 text-[11px] font-normal px-2"
                  onClick={() => void runOAuthSignIn('google')}
                  disabled={oauthOverlay === 'google' || (loading && !oauthOverlay)}
                >
                  <svg className="w-3.5 h-3.5 mr-1 shrink-0" viewBox="0 0 24 24" aria-hidden>
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-8 bg-secondary/20 border-white/10 hover:bg-secondary/35 text-[11px] font-normal px-2"
                  onClick={() => void runOAuthSignIn('apple')}
                  disabled={oauthOverlay === 'apple' || (loading && !oauthOverlay)}
                >
                  <svg className="w-3.5 h-3.5 mr-1 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  Apple
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[10px] text-muted-foreground">
                <button
                  type="button"
                  onClick={handleGuestBrowse}
                  disabled={loading}
                  className="hover:text-foreground transition-colors"
                >
                  Browse as guest
                </button>
                {isLogin && (
                  <>
                    <span aria-hidden className="text-muted-foreground/30">•</span>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => navigate('/auth/qr')}
                      className="hover:text-foreground transition-colors"
                    >
                      QR sign in
                    </button>
                  </>
                )}
                <span aria-hidden className="text-muted-foreground/30">•</span>
                <FounderCounter compact />
              </div>

              <p className="text-center text-[11px] text-muted-foreground pt-1.5 border-t border-white/[0.06]">
                {isLogin ? t('auth.noAccount') : t('auth.hasAccount')}{' '}
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-primary hover:underline font-medium"
                >
                  {isLogin ? t('auth.signup') : t('auth.login')}
                </button>
              </p>
              </>
              )}
            </div>
          </div>
        </motion.div>

        <footer className="shrink-0 space-y-0.5 pt-0.5">
          <nav
            aria-label="Footer"
            className="flex items-center gap-2 overflow-x-auto scrollbar-hide px-0.5 [-webkit-overflow-scrolling:touch] overscroll-x-contain"
          >
            {footerLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <p className="text-center text-[9px] text-muted-foreground/45 shrink-0">© 2026 Vybe Studios</p>
        </footer>

        <p className="sr-only shrink-0">
          Share stories, create clips, message friends, and express yourself with music, AR, and AI.{' '}
          <a href="/about">Learn more about VYBE</a>
        </p>
      </div>

      {/* Touch ripple removed */}

      {/* Apple: opaque cover so any in-WebView flash stays behind Face ID only.
          Google: light dim while the system account sheet is open. */}
      {(oauthOverlay || (isOAuthReturn && loading)) && (
        <div
          className={
            oauthOverlay === 'apple'
              ? 'fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-[#0B0B10] px-6'
              : 'fixed inset-0 z-[80] flex flex-col items-center justify-end gap-3 bg-black/35 px-6 pb-[calc(1.75rem+var(--sab,env(safe-area-inset-bottom,0px)))]'
          }
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 rounded-full bg-[#0B0B10]/85 px-3.5 py-2 shadow-lg">
            <div className="w-4 h-4 rounded-full border-2 border-white/25 border-t-white animate-spin" />
            <p className="text-xs text-white/90">
              {oauthOverlay === 'apple'
                ? 'Apple…'
                : oauthOverlay === 'google'
                  ? 'Google…'
                  : 'Signing in…'}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="rounded-full pointer-events-auto"
            onClick={() => {
              clearDespiaOAuthPending();
              clearOAuthRedirectPending();
              setOauthOverlay(null);
              setLoading(false);
              setIsOAuthReturn(false);
            }}
          >
            Cancel
          </Button>
        </div>
      )}

      <ForgotPasswordDialog
        open={showForgotPassword}
        onClose={() => setShowForgotPassword(false)}
        initialEmail={formData.email}
      />

      {loginGate && (
        <LoginGateModal
          open
          mode={loginGate.mode}
          email={loginGate.email}
          challengeId={loginGate.challengeId}
          expiresAt={loginGate.expiresAt}
          approvalDevice={loginGate.approvalDevice}
          approvalLocation={loginGate.approvalLocation}
          onSuccess={async (session, customToken) => {
            try {
              if (customToken) {
                const { data, error } = await firebaseAuth.signInWithCustomToken(customToken);
                if (error || !data.session?.user) {
                  throw error ?? new Error('Custom token sign-in failed');
                }
                await applyOAuthSession(data.session, 'login_approval');
              } else if (session?.access_token && session?.refresh_token) {
                const { error: sessionError } = await db.auth.setSession({
                  access_token: session.access_token,
                  refresh_token: session.refresh_token,
                });
                if (sessionError) throw sessionError;
                const { data: active, error: activeError } = await db.auth.getUser();
                if (activeError || !active.user) throw activeError ?? new Error('Session was not established');
              } else {
                toast.error('Could not finish signing in. Try again.');
                setLoginGate(null);
                clearPendingLoginApproval();
                return;
              }
            } catch (e) {
              console.warn('finish login after approval failed', e);
              toast.error('Could not finish signing in. Please try again.');
              setLoginGate(null);
              clearPendingLoginApproval();
              return;
            }
            clearPendingLoginApproval();
            setLoginGate(null);
            toast.success('Welcome back! ✨');
            if (isInviteMode && onInviteNavigate) onInviteNavigate('home');
            else navigate(getPostLoginPath('/home'));
          }}
          onCancel={() => {
            clearPendingLoginApproval();
            setLoginGate(null);
          }}
        />
      )}
    </div>
  );
}

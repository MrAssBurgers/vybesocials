import { useState, useEffect, useRef, useLayoutEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth, waitForAuthSession } from '@/lib/auth';
import { getPostLoginPath } from '@/lib/authReturnPath';
import { isLovablePreviewHost } from '@/lib/lovablePreview';
import { isSignupDisabledInSandbox } from '@/lib/previewSandbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Checkbox removed — using custom inline toggle for iOS compatibility
import { toast } from 'sonner';
import { getUserFriendlyError } from '@/lib/errorUtils';
import { Eye, EyeOff, Mail } from 'lucide-react';
import { isNativeAppShell } from '@/lib/despiaBridge';
import { db } from '@/lib/firebase';
import { lovable } from '@/integrations/lovable/index';
import { VYBELogo } from '@/components/ui/VYBELogo';

import { useThemeTransition } from '@/providers/ThemeTransitionProvider';
import { isInviteEntryMode } from '@/lib/referral';
import { ForgotPasswordDialog } from '@/components/auth/ForgotPasswordDialog';
import { LoginGateModal } from '@/components/auth/LoginGateModal';
import { FounderCounter } from '@/components/growth/FounderCounter';
import { getAuthRedirectUrl } from '@/lib/authRedirect';
import { normalizeLoginEmail } from '@/lib/loginEmail';
import { getLoginCredentialErrorMessage, isInvalidLoginCredentialError } from '@/lib/loginErrors';
import { clearLegacySupabaseAuthStorage } from '@/lib/supabaseStorageKey';
import { isGeneratedUsername } from '@/lib/username';
import { VybeLiquidBackground } from '@/components/effects/VybeLiquidBackground';
import { VybeLiquidTouchOverlay } from '@/components/effects/VybeLiquidTouchOverlay';
import { VybeLiquidText } from '@/components/ui/VybeLiquidText';
import { useAuthLandingLiquid } from '@/hooks/useDefaultLiquidBackground';
import { useEmailVerificationPoll } from '@/hooks/useEmailVerificationPoll';


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

/** Scale auth content to fit the viewport without clipping or breaking layout. */
function useAuthScreenFit(enabled: boolean, ...deps: unknown[]) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const fitToViewport = useCallback(() => {
    const el = contentRef.current;
    if (!el || !enabled) {
      setScale(1);
      return;
    }

    el.style.transform = 'none';
    const naturalHeight = el.getBoundingClientRect().height;
    if (!naturalHeight) return;

    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const available = Math.max(280, viewportHeight - 16);
    const nextScale = naturalHeight > available ? available / naturalHeight : 1;
    setScale(Math.min(1, nextScale));
  }, [enabled]);

  useLayoutEffect(() => {
    if (!enabled) {
      setScale(1);
      return;
    }

    fitToViewport();
    const raf = requestAnimationFrame(fitToViewport);
    const afterMotion = window.setTimeout(fitToViewport, 400);

    window.addEventListener('resize', fitToViewport);
    window.visualViewport?.addEventListener('resize', fitToViewport);

    const observer = new ResizeObserver(fitToViewport);
    const el = contentRef.current;
    if (el) observer.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(afterMotion);
      window.removeEventListener('resize', fitToViewport);
      window.visualViewport?.removeEventListener('resize', fitToViewport);
      observer.disconnect();
    };
  }, [enabled, fitToViewport, ...deps]);

  return { contentRef, scale };
}

// Invite mode stage type - shared between invite flow components
export type InviteStage = 'landing' | 'complete-profile' | 'onboarding' | 'home';

interface LandingProps {
  onInviteNavigate?: (stage: InviteStage) => void;
  isInviteMode?: boolean;
}

export default function Landing({ onInviteNavigate, isInviteMode = false }: LandingProps) {
  const { t } = useTranslation();
  const { user, signIn, signUp, resendVerification, authReady, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { triggerTransition } = useThemeTransition();
  
  // Hide bottom nav + lock page scroll while on auth screen
  useAuthPageShell();
  const showAuthLiquid = useAuthLandingLiquid();
  
  // Check URL params for mode (login vs signup) and intro reset
  const modeParam = searchParams.get('mode');
  const pathLower = (typeof window !== 'undefined' ? window.location.pathname : '').toLowerCase();
  const pathSaysSignup = pathLower.includes('signup') || pathLower.includes('sign-up');
  const pathSaysLogin = pathLower.includes('login') || pathLower.includes('signin') || pathLower.includes('sign-in');
  const signupDisabled = isSignupDisabledInSandbox();
  const [isLogin, setIsLogin] = useState(() => {
    if (signupDisabled) return true;
    return pathSaysSignup ? false :
    pathSaysLogin ? true :
    modeParam === 'login' || searchParams.get('signup') !== 'true';
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Detect OAuth return: either hash tokens present OR we set a pending flag before redirect.
  // On mobile Safari with Lovable Cloud OAuth, tokens arrive via setSession (not hash),
  // so we must also check the sessionStorage flag.
  const [isOAuthReturn, setIsOAuthReturn] = useState(() => {
    const hash = window.location.hash;
    const hasHashTokens = hash.includes('access_token') || hash.includes('refresh_token');
    const isPending = sessionStorage.getItem('vybe-oauth-pending') === 'true';
    return hasHashTokens || isPending;
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
  }>(null);
  const [gatePending, setGatePending] = useState(false);
  const [awaitingEmailVerification, setAwaitingEmailVerification] = useState(false);
  useEmailVerificationPoll(awaitingEmailVerification, () => setAwaitingEmailVerification(false));
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: '',
  });

  const showAuthForm =
    isInviteMode ||
    (authReady && !user && !gatePending && !loginGate);

  const { contentRef, scale } = useAuthScreenFit(
    showAuthForm && !isOAuthReturn,
    isLogin,
    loading,
    agreedToTerms,
  );


  // Safety: if OAuth pending flag is set but session never establishes,
  // clear the flag after 5s OR when the user navigates back (page regains focus)
  useEffect(() => {
    if (!isOAuthReturn) return;
    
    // If user arrives (session established), clear immediately
    if (user) {
      sessionStorage.removeItem('vybe-oauth-pending');
      setIsOAuthReturn(false);
      return;
    }

    const clearOAuth = () => {
      console.log('[Landing] OAuth pending cleared');
      sessionStorage.removeItem('vybe-oauth-pending');
      setIsOAuthReturn(false);
      setLoading(false);
    };

    // When user hits "back" from OAuth page, the page regains visibility
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Small delay to let auth state settle if tokens are coming
        setTimeout(() => {
          if (!sessionStorage.getItem('vybe-oauth-pending')) return;
          // Check if we still have no user after returning
          const hash = window.location.hash;
          const hasTokens = hash.includes('access_token') || hash.includes('refresh_token');
          if (!hasTokens) {
            clearOAuth();
          }
        }, 1500);
      }
    };

    // Also handle popstate (browser back button)
    const handlePopState = () => {
      setTimeout(() => {
        const hash = window.location.hash;
        const hasTokens = hash.includes('access_token') || hash.includes('refresh_token');
        if (!hasTokens) {
          clearOAuth();
        }
      }, 500);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handleVisibilityChange);
    window.addEventListener('popstate', handlePopState);
    
    // Fallback timeout reduced to 5s
    const timer = setTimeout(clearOAuth, 5000);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pageshow', handleVisibilityChange);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOAuthReturn, user]);

  // Redirect if already logged in AND has completed onboarding
  // First-time users (even if authenticated) should see intro if not completed
  // IMPORTANT: Don't redirect if user entered via invite link - let them complete the flow
  // When isInviteMode=true, this component is rendered inline from InviteRedeem
  const location = useLocation();
  const isInviteRoute = location.pathname.startsWith('/invite/');
  
  useEffect(() => {
    // In invite mode, auth check and redirects are handled by parent (InviteRedeem)
    if (isInviteMode) {
      console.log('[Landing] In invite mode - auth redirects handled by InviteRedeem');
      return;
    }

    if (!authReady) return;
    if (!user) return;

    // If on invite route or in invite entry mode, don't auto-redirect to home
    if (isInviteRoute || isInviteEntryMode()) {
      console.log('[Landing] In invite flow, skipping auto-redirect');
      return;
    }

    // Use profile from auth context to avoid race condition on iPad Safari
    // where a separate Supabase query runs before the JWT is fully established.
    // Suppress auto-redirect while a 2FA / approval gate decision is in flight
    // (otherwise on mobile the SIGNED_IN listener races the gate and bypasses it).
    if (gatePending || loginGate) return;

    let cancelled = false;
    void (async () => {
      const fresh = await refreshProfile();
      if (cancelled) return;

      if (fresh?.onboarding_completed === false || isGeneratedUsername(fresh?.username)) {
        navigate('/onboarding', { replace: true });
        return;
      }
      if (fresh?.username) {
        const returnPath = getPostLoginPath('/home');
        navigate(returnPath, { replace: true });
        return;
      }
      // Session exists but profile still hydrating — don't trap on auth form.
      navigate(getPostLoginPath('/home'), { replace: true });
    })();

    return () => { cancelled = true; };
  }, [user?.id, authReady, navigate, isInviteRoute, isInviteMode, gatePending, loginGate, refreshProfile]);

  // Prevent the "login flash": if auth is still resolving, show a loader instead of a blank screen.
  if (!isInviteMode && !authReady) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-[3px] border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!isInviteMode && authReady && user && !gatePending && !loginGate) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-[3px] border-primary/30 border-t-primary animate-spin" />
      </div>
    );
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
        setGatePending(true);

        const createHandledLoginError = (message: string) => {
          const err = new Error(message) as Error & { isHandledLoginError?: boolean };
          err.isHandledLoginError = true;
          return err;
        };

        const email = normalizeLoginEmail(formData.email);
        const { error } = await signIn(email, formData.password);
        setGatePending(false);

        if (error) {
          if (isInvalidLoginCredentialError(error)) {
            clearLegacySupabaseAuthStorage();
            throw createHandledLoginError(getLoginCredentialErrorMessage());
          }
          throw error;
        }

        const session = await waitForAuthSession(5000);
        if (!session?.user) {
          throw createHandledLoginError(
            isLovablePreviewHost()
              ? 'Signed in but the session did not stick. Open the preview in a new browser tab and try again.'
              : 'Signed in but the session did not stick. Close the app fully and try again.',
          );
        }

        sessionStorage.removeItem('vybe-session-only');
        clearLegacySupabaseAuthStorage();
        toast.success('Welcome back! ✨');
        if (session.user && !session.user.email_confirmed_at) {
          toast.info('Verify your email to unlock all features.');
        }
        navTo('home', '/home');
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

        const session = await waitForAuthSession();
        if (!session?.user) {
          throw new Error('Account created — please sign in to continue.');
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
      setGatePending(false);
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

  // If returning from OAuth redirect, hold on a loading screen while session is established.
  if (isOAuthReturn) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.15 }}
        className="min-h-screen bg-background flex items-center justify-center"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-[3px] border-primary/30 border-t-primary animate-spin" />
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-sm text-muted-foreground"
          >
            Signing you in…
          </motion.p>
        </div>
      </motion.div>
    );
  }

  const authPageTitle = isLogin ? 'Welcome back' : 'Join VYBE';
  const authSubtitle = signupDisabled
    ? 'Preview sandbox — sign in as Bakrix to tweak the app.'
    : isLogin
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
    <div className="fixed inset-0 z-50 overflow-hidden overscroll-none flex items-center justify-center px-3 sm:px-4">
      {!user && typeof window !== 'undefined' && !isNativeAppShell() && (
        <button
          type="button"
          onClick={() => navigate('/vybe-home')}
          className="fixed top-[max(0.5rem,var(--sat,0px))] left-[max(0.5rem,env(safe-area-inset-left))] z-30 flex items-center gap-1 px-2.5 py-1 rounded-full bg-background/70 hover:bg-background/90 border border-white/10 text-[11px] text-foreground/80 hover:text-foreground backdrop-blur-md transition"
          aria-label="Back to home"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          Home
        </button>
      )}

      {showAuthLiquid && <VybeLiquidBackground interactive backgroundOnly />}

      <div
        ref={contentRef}
        style={{
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'center center',
        }}
        className="relative z-10 w-full max-w-[400px] mx-auto flex flex-col gap-2 sm:gap-2.5 will-change-transform"
      >
        <p className="text-center text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground/75 leading-tight px-1 shrink-0">
          {signupDisabled ? 'Lovable preview · admin sandbox' : 'The Social Platform for Real Connection'}
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
                    {t('auth.email')}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@email.com"
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
                  onClick={async () => {
                    setLoading(true);
                    try {
                      const { firebaseAuth } = await import('@/lib/firebase');
                      const { error } = await firebaseAuth.signInWithOAuth('google', {
                        extraParams: { prompt: 'select_account' },
                      });
                      if (error) throw error;
                      // Popup closed successfully — onAuthStateChanged will pick it up
                    } catch (error: any) {
                      const msg = getUserFriendlyError(error);
                      if (msg !== '__SUPPRESS__') toast.error(msg);
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
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
                  onClick={async () => {
                    setLoading(true);
                    try {
                      sessionStorage.setItem('vybe-oauth-pending', 'true');
                      const { error } = await lovable.auth.signInWithOAuth('apple', {
                        redirect_uri: getAuthRedirectUrl('/auth/callback'),
                      });
                      if (error) {
                        sessionStorage.removeItem('vybe-oauth-pending');
                        throw error;
                      }
                    } catch (error: any) {
                      sessionStorage.removeItem('vybe-oauth-pending');
                      const msg = getUserFriendlyError(error);
                      if (msg !== '__SUPPRESS__') toast.error(msg);
                      setLoading(false);
                    }
                  }}
                  disabled={loading}
                >
                  <svg className="w-3.5 h-3.5 mr-1 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                  </svg>
                  Apple
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-[10px] text-muted-foreground">
                {!signupDisabled && (
                  <button
                    type="button"
                    onClick={handleGuestBrowse}
                    disabled={loading}
                    className="hover:text-foreground transition-colors"
                  >
                    Browse as guest
                  </button>
                )}
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

              {!signupDisabled && (
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
              )}
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
          onSuccess={async (session) => {
            // Apply the session that the verify/approval response handed us.
            // No session existed on this device until this moment.
            if (!session?.access_token || !session?.refresh_token) {
              toast.error('Could not finish signing in. Request a new code and try again.');
              setLoginGate(null);
              setGatePending(false);
              return;
            }
            try {
              const { error: sessionError } = await db.auth.setSession({
                access_token: session.access_token,
                refresh_token: session.refresh_token,
              });
              if (sessionError) throw sessionError;

              const { data: active, error: activeError } = await db.auth.getUser();
              if (activeError || !active.user) throw activeError ?? new Error('Session was not established');
            } catch (e) {
              console.warn('setSession after gate failed', e);
              toast.error('Could not finish signing in. Please try again.');
              setLoginGate(null);
              setGatePending(false);
              return;
            }
            setLoginGate(null);
            setGatePending(false);
            toast.success('Welcome back! ✨');
            if (isInviteMode && onInviteNavigate) onInviteNavigate('home');
            else navigate(getPostLoginPath('/home'));
          }}
          onCancel={() => {
            // No session was ever created on this device — nothing to sign out.
            setLoginGate(null);
            setGatePending(false);
          }}
        />
      )}
    </div>
  );
}

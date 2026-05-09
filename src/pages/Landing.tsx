import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Checkbox removed — using custom inline toggle for iOS compatibility
import { toast } from 'sonner';
import { getUserFriendlyError } from '@/lib/errorUtils';
import { Eye, EyeOff } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { VYBELogo } from '@/components/ui/VYBELogo';

import { useThemeTransition } from '@/providers/ThemeTransitionProvider';
import { isInviteEntryMode } from '@/lib/referral';
import { ForgotPasswordDialog } from '@/components/auth/ForgotPasswordDialog';
import { LoginGateModal } from '@/components/auth/LoginGateModal';
import { passkeysSupported, signInWithPasskey } from '@/lib/passkeys';
import { FounderCounter } from '@/components/growth/FounderCounter';


// Hide bottom nav on landing page
function useHideBottomNav() {
  useEffect(() => {
    document.body.classList.add('hide-bottom-nav');
    return () => {
      document.body.classList.remove('hide-bottom-nav');
    };
  }, []);
}

// Invite mode stage type - shared between invite flow components
export type InviteStage = 'landing' | 'complete-profile' | 'onboarding' | 'home';

interface LandingProps {
  onInviteNavigate?: (stage: InviteStage) => void;
  isInviteMode?: boolean;
}

export default function Landing({ onInviteNavigate, isInviteMode = false }: LandingProps) {
  const { t } = useTranslation();
  const { user, profile: authProfile, signIn, signUp, authReady } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { triggerTransition } = useThemeTransition();
  
  // Hide bottom nav while on landing page
  useHideBottomNav();
  
  // Check URL params for mode (login vs signup) and intro reset
  const modeParam = searchParams.get('mode');
  const pathLower = (typeof window !== 'undefined' ? window.location.pathname : '').toLowerCase();
  const pathSaysSignup = pathLower.includes('signup') || pathLower.includes('sign-up');
  const pathSaysLogin = pathLower.includes('login') || pathLower.includes('signin') || pathLower.includes('sign-in');
  const [isLogin, setIsLogin] = useState(() =>
    pathSaysSignup ? false :
    pathSaysLogin ? true :
    modeParam === 'login' || searchParams.get('signup') !== 'true'
  );
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
  const [loginGate, setLoginGate] = useState<null | { mode: 'code' | 'approval'; email: string; challengeId: string }>(null);
  const [gatePending, setGatePending] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: '',
  });


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
    if (authProfile?.username && authProfile?.onboarding_completed !== false) {
      navigate('/home', { replace: true });
    }
  }, [user, authProfile, navigate, isInviteRoute, isInviteMode, authReady, gatePending, loginGate]);

  // Prevent the "login flash": if auth is still resolving, OR we already have a
  // logged-in user with a completed profile (about to redirect), render nothing.
  // The splash screen / next route paints in our place.
  if (!isInviteMode) {
    if (!authReady) return null;
    if (user && authProfile?.username && authProfile?.onboarding_completed !== false && !gatePending && !loginGate) {
      return null;
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Helper function for navigation - uses callback in invite mode
    const navTo = (stage: InviteStage, fallbackPath: string) => {
      if (isInviteMode && onInviteNavigate) {
        onInviteNavigate(stage);
      } else {
        navigate(fallbackPath);
      }
    };

    try {
      if (isLogin) {
        // Mark gate-pending BEFORE signIn so the auto-redirect effect can't race
        // the SIGNED_IN listener and skip the 2FA / approval check on mobile.
        setGatePending(true);

        const { error } = await signIn(formData.email, formData.password);
        if (error) { setGatePending(false); throw error; }

        // Always persist sessions so users stay signed in reliably
        sessionStorage.removeItem('vybe-session-only');

        // Email 2FA gate (only blocks if user has it enabled)
        try {
          const { data: twoFa } = await supabase.functions.invoke('auth-2fa-request', {
            body: { email: formData.email },
          });
          if ((twoFa as any)?.requires2fa && (twoFa as any)?.challengeId) {
            setLoginGate({ mode: 'code', email: formData.email, challengeId: (twoFa as any).challengeId });
            return;
          }
        } catch (e) { console.warn('2fa check failed', e); }

        // Login approval gate (only blocks if user has it enabled)
        try {
          const { data: appr } = await supabase.functions.invoke('auth-login-approval', {
            body: { action: 'request', email: formData.email },
          });
          if ((appr as any)?.requiresApproval && (appr as any)?.challengeId) {
            setLoginGate({ mode: 'approval', email: formData.email, challengeId: (appr as any).challengeId });
            return;
          }
        } catch (e) { console.warn('approval check failed', e); }

        setGatePending(false);
        toast.success('Welcome back! ✨');
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
        const { error } = await signUp(formData.email, formData.password, formData.username);
        if (error) throw error;
        toast.success('Welcome to VYBE! 🎉');
        navTo('onboarding', '/onboarding');
      }
    } catch (error: any) {
      toast.error(getUserFriendlyError(error));
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

  return (
    <div className="page-scroll-fix bg-background relative flex flex-col items-center justify-start sm:justify-center px-4 py-8">
      {/* Back to home (web marketing page) — hidden on native APK */}
      {!user && typeof window !== 'undefined' && !(window as any).Capacitor?.isNativePlatform?.() && (
        <button
          type="button"
          onClick={() => navigate('/vybe-home')}
          className="fixed top-4 left-4 z-30 flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-foreground/80 hover:text-foreground backdrop-blur transition"
          aria-label="Back to home"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          Home
        </button>
      )}
      {/* Single lightweight gradient backdrop — no stacked blur layers (caused mobile jank) */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at 30% 20%, hsl(var(--primary) / 0.18), transparent 60%), radial-gradient(ellipse at 70% 90%, hsl(var(--accent) / 0.14), transparent 60%)',
        }}
      />

      {/* Public content section for SEO — visible to crawlers */}
      <div className="relative z-10 w-full max-w-[400px] flex flex-col gap-6 my-auto">
        {/* Hero text above the form */}
        <div className="text-center space-y-2 px-2">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">The Social Platform for Real Connection</h2>
          <p className="text-xs text-muted-foreground/80 leading-relaxed">
            Share stories, create clips, message friends, join communities, and express yourself with AR filters, music, and AI-powered tools. 
            <a href="/about" className="text-primary hover:underline ml-1">Learn more about VYBE →</a>
          </p>
        </div>

      {/* Main content - centered card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full"
      >
        <div className="liquid-glass-card rounded-2xl p-5 sm:p-6 border border-white/[0.08]">
          {/* Centered Logo with clean smooth glow */}
          <div className="flex flex-col items-center mb-3 relative">
            {/* Smooth gradient glow behind logo */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div 
                className="w-24 h-24 rounded-full opacity-40"
                style={{
                  background: 'radial-gradient(circle, hsl(var(--primary) / 0.6) 0%, hsl(var(--primary) / 0.2) 40%, transparent 70%)',
                  filter: 'blur(14px)',
                }}
              />
            </div>
            
            <VYBELogo size="md" showText={false} className="mb-1.5 relative z-10" />
            <h1 className="text-lg font-display font-bold gradient-text relative z-10">
              Welcome to VYBE
            </h1>
            <p className="text-xs text-foreground/70 mt-0.5 text-center relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
              Connect. Be present. Build community.
            </p>
          </div>

          {/* Auth Form */}
          <form onSubmit={handleSubmit} className="space-y-2.5">
            {!isLogin && (
              <div className="space-y-1.5 animate-in fade-in duration-200">
                <Label htmlFor="username">{t('auth.username')}</Label>
                <Input
                  id="username"
                  placeholder="Choose a username"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  className="bg-secondary/50 border-border"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="bg-secondary/50 border-border"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <div className="relative flex items-center">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="bg-secondary/50 border-border pr-10"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors h-10"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember me + Forgot password for login */}
            <AnimatePresence>
              {isLogin && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
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
                        width: '14px',
                        height: '14px',
                        minWidth: '14px',
                        minHeight: '14px',
                        maxWidth: '14px',
                        maxHeight: '14px',
                        padding: 0,
                        backgroundColor: rememberMe ? 'hsl(var(--primary))' : 'transparent',
                        borderColor: rememberMe ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.5)',
                      }}
                    >
                      {rememberMe && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                    <label htmlFor="remember" className="text-xs md:text-sm text-muted-foreground">
                      Remember me
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-sm text-primary hover:underline"
                  >
                    Forgot password?
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Terms agreement for signup */}
            <AnimatePresence>
              {!isLogin && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-start gap-2.5"
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
                      width: '18px',
                      height: '18px',
                      minWidth: '18px',
                      minHeight: '18px',
                      maxWidth: '18px',
                      maxHeight: '18px',
                      padding: 0,
                      backgroundColor: agreedToTerms ? 'hsl(var(--primary))' : 'transparent',
                      borderColor: agreedToTerms ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.5)',
                    }}
                  >
                    {agreedToTerms && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                  <span className="text-sm text-muted-foreground leading-tight">
                    I agree to the{' '}
                    <a href="/terms" target="_blank" className="text-primary hover:underline">Terms of Use</a>
                    {' '}and{' '}
                    <a href="/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</a>
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <Button
              type="submit"
              className="w-full gradient-animated text-white font-semibold"
              size="lg"
              disabled={loading || (!isLogin && !agreedToTerms)}
            >
              {loading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                />
              ) : (
                isLogin ? t('auth.login') : t('auth.signup')
              )}
            </Button>

            {isLogin && passkeysSupported() && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    // Discord-style: no email required. Browser shows the
                    // native passkey picker for any account on this device.
                    const link = await signInWithPasskey(formData.email || undefined);
                    if (!link) { toast.info('No passkey found for this device'); return; }
                    window.location.href = link;
                  } catch (e: any) {
                    if (e?.name !== 'NotAllowedError' && e?.name !== 'AbortError') {
                      toast.error('Passkey sign-in failed');
                    }
                  } finally { setLoading(false); }
                }}
              >
                🔑 Sign in with passkey
              </Button>
            )}

            {isLogin && (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={loading}
                onClick={() => navigate('/auth/qr')}
              >
                📷 Sign in with QR code
              </Button>
            )}
          </form>
          <div className="relative my-3">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-3 text-muted-foreground">{t('auth.continueWith')}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Button
              type="button"
              variant="outline"
              className="w-full bg-secondary/30 h-10"
              onClick={async () => {
                setLoading(true);
                try {
                  sessionStorage.setItem('vybe-oauth-pending', 'true');
                  const { error } = await lovable.auth.signInWithOAuth("google", {
                  redirect_uri: window.location.origin,
                    extraParams: {
                      prompt: "select_account",
                    },
                  });
                  if (error) {
                    sessionStorage.removeItem('vybe-oauth-pending');
                    throw error;
                  }
                } catch (error: any) {
                  sessionStorage.removeItem('vybe-oauth-pending');
                  const msg = getUserFriendlyError(error);
                  if (msg !== '__SUPPRESS__') {
                    toast.error(msg);
                  }
                  setLoading(false);
                }
              }}
              disabled={loading}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full bg-secondary/30 h-10"
              onClick={async () => {
                setLoading(true);
                try {
                  sessionStorage.setItem('vybe-oauth-pending', 'true');
                  const { error } = await lovable.auth.signInWithOAuth("apple", {
                    redirect_uri: `${window.location.origin}/auth/callback`,
                  });
                  if (error) {
                    sessionStorage.removeItem('vybe-oauth-pending');
                    throw error;
                  }
                } catch (error: any) {
                  sessionStorage.removeItem('vybe-oauth-pending');
                  const msg = getUserFriendlyError(error);
                  if (msg !== '__SUPPRESS__') {
                    toast.error(msg);
                  }
                  setLoading(false);
                }
              }}
              disabled={loading}
            >
              <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
              Continue with Apple
            </Button>

            <Button
              type="button"
              variant="outline"
              className="w-full bg-secondary/30"
              onClick={handleGuestBrowse}
              disabled={loading}
            >
              👀 Browse as Guest
            </Button>
          </div>

          {/* Founder scarcity counter */}
          <div className="mt-2">
            <FounderCounter compact />
          </div>

          <p className="text-center text-sm text-muted-foreground mt-3">
            {isLogin ? t('auth.noAccount') : t('auth.hasAccount')}{' '}
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline font-medium"
            >
              {isLogin ? t('auth.signup') : t('auth.login')}
            </button>
          </p>
        </div>

        {/* Footer links — slim row, includes all SEO targets for crawlability */}
        <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-3 gap-y-2 mt-4 text-xs text-muted-foreground">
          <a href="/features" className="hover:text-foreground transition-colors">Features</a>
          <span aria-hidden>•</span>
          <a href="/safety" className="hover:text-foreground transition-colors">Safety</a>
          <span aria-hidden>•</span>
          <a href="/faq" className="hover:text-foreground transition-colors">FAQ</a>
          <span aria-hidden>•</span>
          <a href="/blog" className="hover:text-foreground transition-colors">Blog</a>
          <span aria-hidden>•</span>
          <a href="/about" className="hover:text-foreground transition-colors">About</a>
          <span aria-hidden>•</span>
          <a href="/contact" className="hover:text-foreground transition-colors">Contact</a>
          <span aria-hidden>•</span>
          <a href="/privacy" className="hover:text-foreground transition-colors">Privacy</a>
          <span aria-hidden>•</span>
          <a href="/terms" className="hover:text-foreground transition-colors">Terms</a>
          <span aria-hidden>•</span>
          <a href="/cookies" className="hover:text-foreground transition-colors">Cookies</a>
          <span aria-hidden>•</span>
          <a href="/child-safety" className="hover:text-foreground transition-colors">Child Safety</a>
          <span aria-hidden>•</span>
          <a href="/guidelines" className="hover:text-foreground transition-colors">Guidelines</a>
          <span aria-hidden>•</span>
          <a href="/delete-account" className="hover:text-foreground transition-colors">Delete account</a>
        </nav>
        <p className="text-center text-[10px] text-muted-foreground/60 mt-3">© 2026 Vybe Studios</p>
      </motion.div>
      </div>

      <ForgotPasswordDialog 
        open={showForgotPassword} 
        onClose={() => setShowForgotPassword(false)} 
      />

      {loginGate && (
        <LoginGateModal
          open
          mode={loginGate.mode}
          email={loginGate.email}
          challengeId={loginGate.challengeId}
          onSuccess={() => {
            setLoginGate(null);
            toast.success('Welcome back! ✨');
            if (isInviteMode && onInviteNavigate) onInviteNavigate('home');
            else navigate('/home');
          }}
          onCancel={async () => {
            setLoginGate(null);
            try { await supabase.auth.signOut(); } catch {}
          }}
        />
      )}
    </div>
  );
}

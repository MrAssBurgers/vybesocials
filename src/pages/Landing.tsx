import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { getUserFriendlyError } from '@/lib/errorUtils';
import { Eye, EyeOff } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { supabase } from '@/integrations/supabase/client';
import { lovable } from '@/integrations/lovable/index';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { IntroFlow, hasSeenIntro, checkIntroStatus } from '@/components/intro/IntroFlow';
import { useThemeTransition } from '@/providers/ThemeTransitionProvider';
import { isInviteEntryMode } from '@/lib/referral';
import { ForgotPasswordDialog } from '@/components/auth/ForgotPasswordDialog';

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
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { triggerTransition } = useThemeTransition();
  
  // Hide bottom nav while on landing page
  useHideBottomNav();
  
  // Check URL params for mode (login vs signup) and intro reset
  const modeParam = searchParams.get('mode');
  const [isLogin, setIsLogin] = useState(() => modeParam === 'login' || searchParams.get('signup') !== 'true');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showIntro, setShowIntro] = useState<boolean | null>(null); // null = still checking
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: '',
  });

  // Check intro status on mount - use database as source of truth
  useEffect(() => {
    // If mode=login, skip intro completely
    if (modeParam === 'login') {
      setShowIntro(false);
      setIsLogin(true);
      return;
    }
    
    // Check intro status (database first for logged-in users, then localStorage)
    const checkStatus = async () => {
      const userId = user?.id;
      
      // If user is logged in, check their full profile status
      if (userId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('intro_completed, onboarding_completed')
          .eq('user_id', userId)
          .maybeSingle();
        
        // If they've completed onboarding, they don't need to see the intro
        if (profile?.onboarding_completed === true || profile?.intro_completed === true) {
          setShowIntro(false);
          return;
        }
      }
      
      // Fall back to regular intro status check
      const hasCompleted = await checkIntroStatus(userId);
      setShowIntro(!hasCompleted);
    };
    
    checkStatus();
  }, [modeParam, user?.id]);

  // Redirect if already logged in AND has completed onboarding
  // First-time users (even if authenticated) should see intro if not completed
  // IMPORTANT: Don't redirect if user entered via invite link - let them complete the flow
  // When isInviteMode=true, this component is rendered inline from InviteRedeem
  const location = useLocation();
  const isInviteRoute = location.pathname.startsWith('/invite/');
  
  useEffect(() => {
    async function checkAndRedirect() {
      // In invite mode, auth check and redirects are handled by parent (InviteRedeem)
      // The Landing component in invite mode ONLY shows intro, then signals completion
      if (isInviteMode) {
        console.log('[Landing] In invite mode - auth redirects handled by InviteRedeem');
        return;
      }
      
      if (!user) return;
      
      // If on invite route or in invite entry mode, don't auto-redirect to home
      // Let the user complete the full first-time experience
      if (isInviteRoute || isInviteEntryMode()) {
        console.log('[Landing] In invite flow, skipping auto-redirect');
        return;
      }
      
      // Check if user has completed onboarding (has a username set)
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, onboarding_completed')
        .eq('user_id', user.id)
        .maybeSingle();
      
      // If user has completed onboarding (has username), redirect to home
      // Otherwise, let them stay on landing to go through the flow
      if (profile?.username && profile?.onboarding_completed !== false) {
        navigate('/home');
      }
    }
    
    checkAndRedirect();
  }, [user, navigate, isInviteRoute, isInviteMode]);

  // Only hide the landing page if we're about to redirect (handled in useEffect)
  // Don't return null immediately - let the useEffect decide

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
        const { error } = await signIn(formData.email, formData.password);
        if (error) throw error;
        
        // Handle "Remember Me" - if unchecked, set a flag to clear session on browser close
        if (!rememberMe) {
          sessionStorage.setItem('vybe-session-only', 'true');
        } else {
          sessionStorage.removeItem('vybe-session-only');
        }
        
        toast.success('Welcome back! ✨');
        
        // Check if user has completed onboarding before redirecting
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('username, onboarding_completed')
            .eq('user_id', currentUser.id)
            .maybeSingle();
          
          if (profile?.username && profile?.onboarding_completed !== false) {
            navTo('home', '/home');
          } else {
            // No username yet or onboarding not complete - go to onboarding
            navTo('onboarding', '/onboarding');
          }
        } else {
          navTo('home', '/home');
        }
      } else {
        if (!formData.username.trim()) {
          throw new Error('Username is required');
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

  const handleIntroComplete = () => {
    triggerTransition('280 70% 50%', '330 80% 60%', () => {
      setShowIntro(false);
      setIsLogin(false); // Start on signup mode
    });
  };

  const handleIntroSkip = () => {
    triggerTransition('280 70% 50%', '330 80% 60%', () => {
      setShowIntro(false);
    });
  };

  // Show intro flow for first-time visitors (null = still checking, true = show intro)
  if (showIntro === null) {
    // Still checking status - show minimal loading state
    return <div className="min-h-screen bg-background" />;
  }
  
  if (showIntro) {
    return <IntroFlow onComplete={handleIntroComplete} onSkip={handleIntroSkip} />;
  }

  return (
    <div className="min-h-screen bg-background overflow-hidden relative flex items-center justify-center">
      {/* Simplified static background for better performance */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full gradient-animated opacity-10 blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full gradient-animated opacity-10 blur-3xl" />
      </div>

      {/* Main content - centered card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="glass-card rounded-3xl p-8 gradient-border">
          {/* Centered Logo with clean smooth glow */}
          <div className="flex flex-col items-center mb-8 relative">
            {/* Smooth gradient glow behind logo */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div 
                className="w-40 h-40 rounded-full opacity-40"
                style={{
                  background: 'radial-gradient(circle, hsl(var(--primary) / 0.6) 0%, hsl(var(--primary) / 0.2) 40%, transparent 70%)',
                  filter: 'blur(20px)',
                }}
              />
            </div>
            
            <VYBELogo size="xl" showText={false} className="mb-4 relative z-10" />
            <h1 className="text-2xl font-display font-bold gradient-text relative z-10">
              Welcome to VYBE
            </h1>
            <p className="text-sm text-foreground/70 mt-1 text-center relative z-10 drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
              Connect. Be present. Build community.
            </p>
          </div>

          {/* Auth Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <AnimatePresence mode="wait">
              {!isLogin && (
                <motion.div
                  key="username"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-2"
                >
                  <Label htmlFor="username">{t('auth.username')}</Label>
                  <Input
                    id="username"
                    placeholder="Choose a username"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    className="bg-secondary/50 border-border"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-2">
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

            <div className="space-y-2">
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
                  className="flex items-start gap-2"
                >
                  <Checkbox
                    id="terms"
                    checked={agreedToTerms}
                    onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                    className="mt-0.5 h-4 w-4 md:h-5 md:w-5 rounded-full"
                  />
                  <label htmlFor="terms" className="text-sm text-muted-foreground leading-tight">
                    I agree to the{' '}
                    <a href="/terms" target="_blank" className="text-primary hover:underline">Terms of Use</a>
                    {' '}and{' '}
                    <a href="/privacy" target="_blank" className="text-primary hover:underline">Privacy Policy</a>
                  </label>
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
          </form>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-3 text-muted-foreground">{t('auth.continueWith')}</span>
            </div>
          </div>

          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="w-full bg-secondary/30 h-11"
              onClick={async () => {
                setLoading(true);
                try {
                  const { error } = await lovable.auth.signInWithOAuth("google", {
                    redirect_uri: window.location.origin,
                  });
                  if (error) throw error;
                } catch (error: any) {
                  toast.error(getUserFriendlyError(error));
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
              className="w-full bg-secondary/30 h-11"
              onClick={async () => {
                setLoading(true);
                try {
                  const { error } = await lovable.auth.signInWithOAuth("apple", {
                    redirect_uri: window.location.origin,
                  });
                  if (error) throw error;
                } catch (error: any) {
                  toast.error(getUserFriendlyError(error));
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

          <p className="text-center text-sm text-muted-foreground mt-6">
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

        {/* Footer links */}
        <div className="flex justify-center gap-4 mt-4 text-xs text-muted-foreground">
          <a href="/privacy" className="hover:text-foreground transition-colors">Privacy</a>
          <span>•</span>
          <a href="/terms" className="hover:text-foreground transition-colors">Terms</a>
          <span>•</span>
          <a href="/guidelines" className="hover:text-foreground transition-colors">Guidelines</a>
        </div>
      </motion.div>

      {/* Forgot Password Dialog */}
      <ForgotPasswordDialog 
        open={showForgotPassword} 
        onClose={() => setShowForgotPassword(false)} 
      />
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { getUserFriendlyError } from '@/lib/errorUtils';
import { Sparkles, Chrome, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { IntroFlow, hasSeenIntro } from '@/components/intro/IntroFlow';
import { useThemeTransition } from '@/providers/ThemeTransitionProvider';
import { isInviteEntryMode } from '@/lib/referral';

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
  const [showIntro, setShowIntro] = useState(!hasSeenIntro());
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: '',
  });

  // Re-check intro status on mount (in case it was reset by invite flow)
  useEffect(() => {
    const introNotSeen = !hasSeenIntro();
    if (introNotSeen) {
      setShowIntro(true);
    }
    // If mode=login, skip intro and go straight to login
    if (modeParam === 'login') {
      setShowIntro(false);
      setIsLogin(true);
    }
  }, [modeParam]);

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
          } else if (!profile?.username) {
            navTo('complete-profile', '/complete-profile');
          } else {
            navTo('onboarding', '/onboarding');
          }
        } else {
          navTo('home', '/home');
        }
      } else {
        if (!formData.username.trim()) {
          throw new Error('Username is required');
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

  // Show intro flow for first-time visitors
  if (showIntro) {
    return <IntroFlow onComplete={handleIntroComplete} onSkip={handleIntroSkip} />;
  }

  return (
    <div className="min-h-screen bg-background overflow-hidden relative flex items-center justify-center">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute -top-1/2 -left-1/2 w-full h-full gradient-animated opacity-15 blur-3xl"
        />
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            rotate: [360, 180, 0],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: "linear",
          }}
          className="absolute -bottom-1/2 -right-1/2 w-full h-full gradient-animated opacity-15 blur-3xl"
        />
      </div>

      {/* Main content - centered card */}
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md mx-4"
      >
        <div className="glass-card rounded-3xl p-8 gradient-border">
          {/* Centered Logo with glow */}
          <div className="flex flex-col items-center mb-8 relative">
            {/* Animated glow behind logo */}
            <motion.div
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.3, 0.5, 0.3],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="w-32 h-32 rounded-full bg-primary/30 blur-2xl" />
            </motion.div>
            
            <VYBELogo size="xl" showText={false} className="mb-4 relative z-10" />
            <h1 className="text-2xl font-display font-bold gradient-text relative z-10">
              Welcome to VYBE
            </h1>
            <p className="text-sm text-muted-foreground mt-1 text-center relative z-10">
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
              <div className="relative">
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full gradient-animated text-white font-semibold"
              size="lg"
              disabled={loading}
            >
              {loading ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                />
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {isLogin ? t('auth.login') : t('auth.signup')}
                </>
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
              className="w-full bg-secondary/30"
              onClick={async () => {
                setLoading(true);
                try {
                  // In invite mode, redirect back to current invite URL after OAuth
                  // This preserves the invite URL through the OAuth flow
                  // Note: OAuth is an external redirect, so we can't use internal callbacks
                  // The user will return to the invite URL, and the useEffect will handle stage transition
                  const redirectUrl = isInviteMode 
                    ? window.location.href // Keep current invite URL
                    : `${window.location.origin}/complete-profile`;
                  
                  const { error } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                      redirectTo: redirectUrl,
                    },
                  });
                  if (error) throw error;
                } catch (error: any) {
                  toast.error(getUserFriendlyError(error));
                  setLoading(false);
                }
              }}
              disabled={loading}
            >
              <Chrome className="w-4 h-4 mr-2" />
              Google
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
    </div>
  );
}

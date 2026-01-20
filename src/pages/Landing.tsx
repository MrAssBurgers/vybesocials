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
  const { user, authReady, signIn, signUp, profile } = useAuth();
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

  // Redirect authenticated users ONLY after auth is fully ready
  const location = useLocation();
  const isInviteRoute = location.pathname.startsWith('/invite/');

  useEffect(() => {
    // CRITICAL: Wait for authReady before any redirect logic
    if (!authReady) return;
    
    // In invite mode, parent handles redirects
    if (isInviteMode) {
      console.log('[Landing] In invite mode - redirects handled by InviteRedeem');
      return;
    }

    // No user = stay on landing
    if (!user) return;

    // If on invite route, don't auto-redirect (InviteRedeem owns the flow)
    if (isInviteRoute) {
      console.log('[Landing] On invite route, skipping auto-redirect');
      return;
    }

    // Wait for profile to load before deciding where to go
    if (!profile) return;

    // Redirect based on onboarding status
    if (profile.onboarding_completed) {
      navigate('/home', { replace: true });
    } else {
      navigate('/onboarding', { replace: true });
    }
  }, [authReady, user, profile, navigate, isInviteRoute, isInviteMode]);

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
        // Auth state change will trigger redirect via useEffect
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
          {/* Centered Logo with subtle glow */}
          <div className="flex flex-col items-center mb-8 relative">
            {/* Static glow behind logo for better performance */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-32 h-32 rounded-full bg-primary/30 blur-2xl" />
            </div>
            
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
                  // Always return through a dedicated callback route so we can reliably
                  // exchange the OAuth code + decide the post-login destination.
                  const next = isInviteMode
                    ? `${window.location.pathname}${window.location.search}`
                    : '/';

                  const redirectUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

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

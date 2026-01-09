import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { getUserFriendlyError } from '@/lib/errorUtils';
import { Sparkles, Zap, Users, Globe, MessageCircle, Chrome } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

export default function Landing() {
  const { t } = useTranslation();
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    username: '',
  });

  // Redirect if already logged in
  if (user) {
    navigate('/home');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await signIn(formData.email, formData.password);
        if (error) throw error;
        toast.success(t('auth.login') + ' ✨');
        navigate('/home');
      } else {
        if (!formData.username.trim()) {
          throw new Error('Username is required');
        }
        const { error } = await signUp(formData.email, formData.password, formData.username);
        if (error) throw error;
        toast.success('Welcome to XD! 🎉');
        navigate('/onboarding');
      }
    } catch (error: any) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    try {
      const { error } = await signIn('demo@xd.app', 'demo123456');
      if (error) {
        const { error: signUpError } = await signUp('demo@xd.app', 'demo123456', 'demouser');
        if (signUpError && !signUpError.message.includes('already registered')) {
          throw signUpError;
        }
        await signIn('demo@xd.app', 'demo123456');
      }
      toast.success('Welcome to the demo! 🎭');
      navigate('/home');
    } catch (error: any) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background overflow-hidden relative">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
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
          className="absolute -top-1/2 -left-1/2 w-full h-full gradient-animated opacity-20 blur-3xl"
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
          className="absolute -bottom-1/2 -right-1/2 w-full h-full gradient-animated opacity-20 blur-3xl"
        />
      </div>

      <div className="relative z-10 min-h-screen flex flex-col lg:flex-row">
        {/* Left side - Hero */}
        <div className="flex-1 flex flex-col justify-center px-8 py-12 lg:px-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Logo */}
            <div className="flex items-center gap-3 mb-8">
              <motion.div 
                className="gradient-animated rounded-2xl p-3"
                whileHover={{ scale: 1.1, rotate: 5 }}
                whileTap={{ scale: 0.95 }}
              >
                <Sparkles className="w-8 h-8 text-white" />
              </motion.div>
              <h1 className="font-display text-5xl font-black gradient-text">XD</h1>
            </div>

            {/* Tagline */}
            <h2 className="text-4xl lg:text-6xl font-display font-bold mb-6 leading-tight">
              {t('app.tagline').split(' ').map((word, i) => (
                <span key={i} className={i % 2 === 1 ? 'gradient-text' : ''}>
                  {word}{' '}
                </span>
              ))}
            </h2>

            <p className="text-xl text-muted-foreground mb-8 max-w-lg">
              {t('app.description')}
            </p>

            {/* Features */}
            <div className="grid grid-cols-2 gap-4 mb-8">
              {[
                { icon: Zap, label: 'Shorts & Reels' },
                { icon: MessageCircle, label: 'DMs & Stories' },
                { icon: Users, label: 'Communities' },
                { icon: Globe, label: 'Global Reach' },
              ].map((feature, index) => (
                <motion.div
                  key={feature.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + index * 0.1 }}
                  whileHover={{ scale: 1.05, y: -2 }}
                  className="glass-card rounded-xl p-4 flex items-center gap-3"
                >
                  <feature.icon className="w-6 h-6 text-primary" />
                  <span className="font-medium">{feature.label}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Right side - Auth Form */}
        <div className="lg:w-[480px] flex items-center justify-center px-8 py-12">
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="w-full max-w-sm"
          >
            <div className="glass-card rounded-2xl p-8 gradient-border">
              <h3 className="text-2xl font-bold mb-6 text-center">
                {isLogin ? t('auth.login') : t('auth.signup')}
              </h3>

              <form onSubmit={handleSubmit} className="space-y-4">
                {!isLogin && (
                  <div className="space-y-2">
                    <Label htmlFor="username">{t('auth.username')}</Label>
                    <Input
                      id="username"
                      placeholder="Choose a username"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      className="bg-secondary border-border"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">{t('auth.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="bg-secondary border-border"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">{t('auth.password')}</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="bg-secondary border-border"
                    required
                    minLength={6}
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full gradient-animated text-white font-semibold"
                  size="lg"
                  disabled={loading}
                >
                  {loading ? 'Loading...' : isLogin ? t('auth.login') : t('auth.signup')}
                </Button>
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">{t('auth.continueWith')}</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full mb-2"
                onClick={async () => {
                  setLoading(true);
                  try {
                    const { error } = await supabase.auth.signInWithOAuth({
                      provider: 'google',
                      options: {
                        redirectTo: `${window.location.origin}/home`,
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
                Continue with Google
              </Button>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleDemoLogin}
                disabled={loading}
              >
                🎭 {t('auth.demoAccount')}
              </Button>

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
          </motion.div>
        </div>
      </div>
    </div>
  );
}

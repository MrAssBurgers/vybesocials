import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

export default function Landing() {
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
        toast.success('Welcome back!');
        navigate('/home');
      } else {
        if (!formData.username.trim()) {
          throw new Error('Username is required');
        }
        const { error } = await signUp(formData.email, formData.password, formData.username);
        if (error) throw error;
        toast.success('Account created! Welcome to LOLLoop!');
        navigate('/home');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    try {
      // Try to sign in with demo account
      const { error } = await signIn('demo@lolloop.com', 'demo123456');
      if (error) {
        // If demo account doesn't exist, create it
        const { error: signUpError } = await signUp('demo@lolloop.com', 'demo123456', 'demouser');
        if (signUpError && !signUpError.message.includes('already registered')) {
          throw signUpError;
        }
        // Try signing in again
        await signIn('demo@lolloop.com', 'demo123456');
      }
      toast.success('Welcome to the demo!');
      navigate('/home');
    } catch (error: any) {
      toast.error(error.message);
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
              <div className="gradient-animated rounded-2xl p-3">
                <span className="text-4xl">😂</span>
              </div>
              <h1 className="font-display text-4xl font-bold gradient-text">LOLLoop</h1>
            </div>

            {/* Tagline */}
            <h2 className="text-4xl lg:text-6xl font-display font-bold mb-6 leading-tight">
              Where <span className="gradient-text">funny</span> goes{' '}
              <span className="gradient-text">viral</span>
            </h2>

            <p className="text-xl text-muted-foreground mb-8 max-w-lg">
              Discover, create, and share the funniest content on the internet. 
              Memes, fails, pets, gaming - all in one endless loop of laughter.
            </p>

            {/* Features */}
            <div className="grid grid-cols-2 gap-4 mb-8">
              {[
                { emoji: '🎬', label: 'Shorts & Reels' },
                { emoji: '📸', label: 'Photo Memes' },
                { emoji: '🎮', label: 'Gaming Clips' },
                { emoji: '🐾', label: 'Pet Videos' },
              ].map((feature) => (
                <motion.div
                  key={feature.label}
                  whileHover={{ scale: 1.05 }}
                  className="glass-card rounded-xl p-4 flex items-center gap-3"
                >
                  <span className="text-2xl">{feature.emoji}</span>
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
                {isLogin ? 'Welcome back!' : 'Join LOLLoop'}
              </h3>

              <form onSubmit={handleSubmit} className="space-y-4">
                {!isLogin && (
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
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
                  <Label htmlFor="email">Email</Label>
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
                  <Label htmlFor="password">Password</Label>
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
                  className="w-full"
                  variant="gradient"
                  size="lg"
                  disabled={loading}
                >
                  {loading ? 'Loading...' : isLogin ? 'Sign In' : 'Create Account'}
                </Button>
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleDemoLogin}
                disabled={loading}
              >
                🎭 Try Demo Account
              </Button>

              <p className="text-center text-sm text-muted-foreground mt-6">
                {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
                <button
                  type="button"
                  onClick={() => setIsLogin(!isLogin)}
                  className="text-primary hover:underline font-medium"
                >
                  {isLogin ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

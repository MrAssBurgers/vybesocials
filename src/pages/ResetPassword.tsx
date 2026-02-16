import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { Eye, EyeOff, Lock, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);

  const resetToken = searchParams.get('token');

  useEffect(() => {
    // If we have our custom token, use our standalone flow
    if (resetToken) {
      setTokenValid(true);
      setChecking(false);
      return;
    }

    // Fallback: check for Supabase recovery event (legacy support)
    const checkExistingSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setTokenValid(true);
        setChecking(false);
        return true;
      }
      return false;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setTokenValid(true);
        setChecking(false);
      }
    });

    checkExistingSession().then((hasSession) => {
      if (!hasSession) {
        setTimeout(() => {
          setChecking(prev => {
            if (prev) {
              checkExistingSession().then((found) => {
                if (!found) {
                  setError('Invalid or expired reset link. Please request a new one.');
                  setChecking(false);
                }
              });
            }
            return false;
          });
        }, 3000);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [resetToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      if (resetToken) {
        // Use our standalone edge function
        const { data, error: fnError } = await supabase.functions.invoke('send-auth-email', {
          body: {
            action: 'reset_password',
            token: resetToken,
            newPassword: password,
          },
        });

        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
      } else {
        // Legacy Supabase flow
        const { error } = await supabase.auth.updateUser({
          password: password,
        });
        if (error) throw error;
      }

      setSuccess(true);
      toast.success('Password updated successfully!');
      
      setTimeout(() => {
        navigate('/?mode=login');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password');
      toast.error(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card rounded-3xl p-8 max-w-md w-full text-center"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Password Reset!</h1>
          <p className="text-muted-foreground mb-4">
            Your password has been successfully updated. Redirecting to login...
          </p>
        </motion.div>
      </div>
    );
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground text-sm">Verifying reset link...</p>
        </motion.div>
      </div>
    );
  }

  if (!tokenValid && error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card rounded-3xl p-8 max-w-md w-full text-center"
        >
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-destructive/20 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-xl font-bold mb-2">Link Expired</h1>
          <p className="text-muted-foreground text-sm mb-4">{error}</p>
          <Button onClick={() => navigate('/?mode=login')} className="w-full">
            Back to Login
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full gradient-animated opacity-10 blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full gradient-animated opacity-10 blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card rounded-3xl p-8 max-w-md w-full relative z-10"
      >
        <div className="flex flex-col items-center mb-6">
          <VYBELogo size="lg" showText={false} className="mb-4" />
          <h1 className="text-2xl font-bold">Reset Password</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Enter your new password below
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-secondary/50 border-border pl-10 pr-10"
                required
                minLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-secondary/50 border-border pl-10"
                required
                minLength={6}
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full gradient-animated text-white"
            size="lg"
            disabled={loading}
          >
            {loading ? 'Updating...' : 'Update Password'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Remember your password?{' '}
          <button
            onClick={() => navigate('/?mode=login')}
            className="text-primary hover:underline"
          >
            Log in
          </button>
        </p>
      </motion.div>
    </div>
  );
}

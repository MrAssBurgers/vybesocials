import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { Eye, EyeOff, Lock, CheckCircle, Loader2, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/authService';
import { toast } from 'sonner';
import { getUserFriendlyError } from '@/lib/errorUtils';

function getFirebaseResetOobCode(url: URL): string | null {
  const oobCode = url.searchParams.get('oobCode');
  if (!oobCode) return null;
  const mode = url.searchParams.get('mode');
  if (mode === 'resetPassword') return oobCode;
  if (url.pathname === '/reset-password' || url.pathname === '/auth/reset-password') {
    return oobCode;
  }
  return null;
}

async function establishRecoverySession(): Promise<
  { ok: true; oobCode?: string; email?: string } | { ok: false; message: string }
> {
  const url = new URL(window.location.href);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  const queryParams = url.searchParams;

  const firebaseOobCode = getFirebaseResetOobCode(url);
  if (firebaseOobCode) {
    try {
      const auth = getFirebaseAuth();
      if (!auth) return { ok: false, message: 'Auth is not configured.' };
      const email = await verifyPasswordResetCode(auth, firebaseOobCode);
      window.history.replaceState(null, '', url.pathname);
      return { ok: true, oobCode: firebaseOobCode, email };
    } catch {
      return { ok: false, message: 'Invalid or expired reset link. Please request a new one.' };
    }
  }

  const code = queryParams.get('code') || hashParams.get('code');
  const tokenHash = queryParams.get('token_hash');
  const type = queryParams.get('type') || hashParams.get('type');

  if (code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    if (error) return { ok: false, message: error.message || 'Invalid or expired reset link.' };
    window.history.replaceState(null, '', url.pathname);
    return { ok: true };
  }

  if (tokenHash && type === 'recovery') {
    const { error } = await db.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    if (error) return { ok: false, message: error.message || 'Invalid or expired reset link.' };
    window.history.replaceState(null, '', url.pathname);
    return { ok: true };
  }

  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');
  if (accessToken && refreshToken && type === 'recovery') {
    const { error } = await db.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) return { ok: false, message: error.message || 'Invalid or expired reset link.' };
    window.history.replaceState(null, '', url.pathname);
    return { ok: true };
  }

  const { data: { session } } = await db.auth.getSession();
  if (session) return { ok: true };

  return { ok: false, message: 'Invalid or expired reset link. Please request a new one.' };
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [firebaseOobCode, setFirebaseOobCode] = useState<string | null>(null);
  const [accountEmail, setAccountEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let recoveryTimer: ReturnType<typeof setTimeout> | null = null;

    const finishOk = () => {
      if (cancelled) return;
      setTokenValid(true);
      setChecking(false);
    };

    const finishErr = (message: string) => {
      if (cancelled) return;
      setError(message);
      setChecking(false);
    };

    const { data: { subscription } } = db.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        finishOk();
      }
    });

    void (async () => {
      const result = await establishRecoverySession();
      if (cancelled) return;
      if (result.ok) {
        if ('oobCode' in result && result.oobCode) setFirebaseOobCode(result.oobCode);
        if ('email' in result && result.email) setAccountEmail(result.email);
        finishOk();
        return;
      }

      recoveryTimer = setTimeout(() => {
        if (!cancelled) finishErr((result as any).message || '');
      }, 2500);
    })();

    return () => {
      cancelled = true;
      if (recoveryTimer) clearTimeout(recoveryTimer);
      subscription.unsubscribe();
    };
  }, []);

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
      if (firebaseOobCode) {
        const auth = getFirebaseAuth();
        if (!auth) throw new Error('Auth is not configured.');
        await confirmPasswordReset(auth, firebaseOobCode, password);
      } else {
        const { error } = await db.auth.updateUser({ password });
        if (error) throw error;
      }

      setSuccess(true);
      toast.success('Password updated successfully!');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: unknown) {
      const message = getUserFriendlyError(err);
      setError(message);
      toast.error(message);
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
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
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
          <Button onClick={() => navigate('/login')} className="w-full">
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
          <p className="text-muted-foreground text-sm mt-1 text-center">
            {accountEmail ? (
              <>
                Choose a new password for <span className="text-foreground font-medium">{accountEmail}</span>
              </>
            ) : (
              'Enter your new password below'
            )}
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

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" variant="gradient" className="w-full" size="lg" disabled={loading}>
            {loading ? 'Updating...' : 'Update Password'}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Remember your password?{' '}
          <button onClick={() => navigate('/login')} className="text-primary hover:underline">
            Log in
          </button>
        </p>
      </motion.div>
    </div>
  );
}

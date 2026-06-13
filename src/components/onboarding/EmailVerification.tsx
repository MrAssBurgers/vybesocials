import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Mail, Shield, CheckCircle, Loader2 } from 'lucide-react';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getAuthRedirectUrl } from '@/lib/authRedirect';
import { toast } from 'sonner';

const RESEND_COOLDOWN_SECONDS = 30;
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { useAuth } from '@/lib/auth';

interface EmailVerificationProps {
  onVerified?: () => void;
}

export function EmailVerification({ onVerified }: EmailVerificationProps) {
  const { user } = useAuth();
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(user?.email_confirmed_at ? true : false);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown ticker for resend button
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const mapAuthError = (err: any): string => {
    const msg = String(err?.message || err || '').toLowerCase();
    if (msg.includes('rate') || msg.includes('too many') || err?.status === 429) {
      return 'Too many requests. Wait a moment before trying again.';
    }
    if (msg.includes('signups not allowed') || msg.includes('not authorized')) {
      return 'Email signups are temporarily disabled. Contact support.';
    }
    if (msg.includes('invalid') && msg.includes('email')) {
      return 'That email address looks invalid.';
    }
    if (msg.includes('smtp') || msg.includes('provider')) {
      return 'Email provider is misconfigured. Please contact support.';
    }
    return err?.message || 'Could not send verification code. Please try again.';
  };

  const handleSendCode = async () => {
    if (!user?.email) {
      toast.error('No email associated with this account');
      return;
    }
    if (cooldown > 0) return;

    setLoading(true);
    console.log('[email-verify] send_code:start', { email: user.email });

    try {
      // For an already-signed-in user whose email isn't confirmed, the
      // correct call is `resend({ type: 'signup' })`. `signInWithOtp` with
      // `shouldCreateUser:false` fails on existing-but-unverified accounts
      // with "Signups not allowed for otp" — that was the source of the
      // generic "failed to send verification code" toast.
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
        options: { emailRedirectTo: getAuthRedirectUrl('/auth/callback') },
      });

      if (error) {
        // Fallback path: try OTP signin (covers email-change flows).
        console.warn('[email-verify] resend failed, trying signInWithOtp', error);
        const { error: otpErr } = await supabase.auth.signInWithOtp({
          email: user.email,
          options: { shouldCreateUser: false },
        });
        if (otpErr) throw otpErr;
      }

      console.log('[email-verify] send_code:success');
      setCodeSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast.success('Verification code sent — check your email');
    } catch (error: any) {
      console.error('[email-verify] send_code:error', error);
      toast.error(mapAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (code.length !== 6 || !user?.email) return;
    setLoading(true);
    
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: user.email,
        token: code,
        type: 'email',
      });
      
      if (error) throw error;
      
      setVerified(true);
      toast.success('Email verified successfully!');
      onVerified?.();
    } catch (error: any) {
      console.error('Error verifying code:', error);
      toast.error(error.message || 'Invalid verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setCode('');
    await handleSendCode();
  };

  if (verified) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold gradient-text">Email Verified!</h2>
          <p className="text-muted-foreground mt-2">Your account is secured</p>
        </div>
        
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center gap-4 p-6 rounded-xl bg-card/80 backdrop-blur-md border border-primary/20"
        >
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-primary-foreground" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-lg">All Set!</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-xl sm:text-2xl font-bold gradient-text">Verify Your Email</h2>
        <p className="text-sm text-muted-foreground mt-1">Secure your account with email verification</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        {/* Benefits */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: Shield, text: 'Account Security' },
            { icon: null, text: 'Full Access', useVybe: true },
          ].map((benefit, i) => (
            <div key={i} className="flex flex-col items-center gap-1 p-3 rounded-lg bg-card/80 backdrop-blur-md border border-border/50">
              {benefit.useVybe ? (
                <VybeMiniIcon size={20} showSparkles />
              ) : benefit.icon ? (
                <benefit.icon className="w-5 h-5 text-primary" />
              ) : null}
              <span className="text-xs text-center">{benefit.text}</span>
            </div>
          ))}
        </div>

        {/* Email display */}
        <div className="space-y-3 p-4 rounded-xl bg-card/80 backdrop-blur-md border border-border/50">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
            <Mail className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium truncate">{user?.email}</span>
          </div>

          {!codeSent ? (
            <Button 
              onClick={handleSendCode}
              disabled={loading}
              className="w-full gradient-animated"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Mail className="w-4 h-4 mr-2" />
              )}
              Send Verification Code
            </Button>
          ) : (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-3"
            >
              <p className="text-xs text-muted-foreground text-center">
                Enter the 6-digit code sent to your email
              </p>
              
              <div className="flex flex-col items-center gap-3">
                <InputOTP
                  maxLength={6}
                  pattern={REGEXP_ONLY_DIGITS}
                  value={code}
                  onChange={setCode}
                >
                  <InputOTPGroup className="gap-1">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <InputOTPSlot 
                        key={i} 
                        index={i} 
                        className="w-9 h-10 sm:w-10 sm:h-11 text-sm bg-background/50 border-border/50"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                
                <div className="flex gap-2">
                  <Button
                    onClick={handleVerifyCode}
                    disabled={code.length !== 6 || loading}
                    className="gradient-animated h-9 px-4 text-sm"
                  >
                    {loading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Verify'
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleResendCode}
                    disabled={loading || cooldown > 0}
                    className="h-9 px-3 text-sm bg-background/50"
                  >
                    {cooldown > 0 ? `Resend (${cooldown}s)` : 'Resend'}
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* Skip notice */}
        <p className="text-center text-xs text-muted-foreground">
          Optional - you can verify your email later in Settings
        </p>
      </motion.div>
    </div>
  );
}

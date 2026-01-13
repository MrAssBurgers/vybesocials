import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Phone, Shield, CheckCircle, Loader2, Users } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

interface PhoneVerificationProps {
  phoneNumber: string;
  onChange: (phone: string) => void;
  onVerified?: () => void;
}

export function PhoneVerification({ phoneNumber, onChange, onVerified }: PhoneVerificationProps) {
  const { t } = useTranslation();
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);

  const formatPhoneNumber = (phone: string) => {
    // Ensure phone starts with + for international format
    const cleaned = phone.replace(/\D/g, '');
    if (phone.startsWith('+')) {
      return `+${cleaned}`;
    }
    // Default to US if no country code
    return `+1${cleaned}`;
  };

  const handleSendCode = async () => {
    if (!phoneNumber) return;
    setLoading(true);
    
    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);
      
      // Use Supabase Auth to send OTP
      const { error } = await supabase.auth.updateUser({
        phone: formattedPhone,
      });
      
      if (error) throw error;
      
      setCodeSent(true);
      toast.success('Verification code sent!');
    } catch (error: any) {
      console.error('Error sending code:', error);
      toast.error(error.message || 'Failed to send verification code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (code.length !== 6) return;
    setLoading(true);
    
    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);
      
      const { error } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: code,
        type: 'sms',
      });
      
      if (error) throw error;
      
      // Update profile with verified phone
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase
          .from('profiles')
          .update({ 
            phone_number: formattedPhone,
            phone_verified: true,
          })
          .eq('user_id', user.id);
      }
      
      setVerified(true);
      toast.success('Phone verified successfully!');
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
          <h2 className="text-2xl font-bold gradient-text">{t('onboarding.step5Title')}</h2>
          <p className="text-muted-foreground mt-2">{t('onboarding.step5Subtitle')}</p>
        </div>
        
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center gap-4 p-6 rounded-xl bg-primary/10 border border-primary/20"
        >
          <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-primary" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-lg">Phone Verified!</p>
            <p className="text-sm text-muted-foreground">{phoneNumber}</p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold gradient-text">{t('onboarding.step5Title')}</h2>
        <p className="text-muted-foreground mt-2">{t('onboarding.step5Subtitle')}</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Benefits */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { icon: Shield, text: 'Account recovery' },
            { icon: CheckCircle, text: 'Verified badge' },
            { icon: Users, text: 'Find friends by contacts' },
          ].map((benefit, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border">
              <benefit.icon className="w-5 h-5 text-primary" />
              <span className="text-sm">{benefit.text}</span>
            </div>
          ))}
        </div>

        {/* Phone Input */}
        <div className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="tel"
                placeholder="+1 (555) 000-0000"
                value={phoneNumber}
                onChange={(e) => onChange(e.target.value)}
                className="pl-10 bg-card border-border"
                disabled={codeSent}
              />
            </div>
            {!codeSent && (
              <Button 
                onClick={handleSendCode}
                disabled={!phoneNumber || loading}
                className="gradient-animated"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  'Send Code'
                )}
              </Button>
            )}
          </div>

          {codeSent && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4"
            >
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code sent to {phoneNumber}
              </p>
              
              <div className="flex flex-col items-center gap-4">
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={setCode}
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
                
                <div className="flex gap-2">
                  <Button
                    onClick={handleVerifyCode}
                    disabled={code.length !== 6 || loading}
                    className="gradient-animated"
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
                    disabled={loading}
                  >
                    Resend
                  </Button>
                </div>
              </div>
              
              <Button
                variant="link"
                className="p-0 h-auto text-sm"
                onClick={() => {
                  setCodeSent(false);
                  setCode('');
                }}
              >
                Change phone number
              </Button>
            </motion.div>
          )}
        </div>

        {/* Skip notice */}
        <p className="text-center text-sm text-muted-foreground">
          This step is optional. You can add your phone number later in Settings.
        </p>
      </motion.div>
    </div>
  );
}

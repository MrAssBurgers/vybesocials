import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Phone, Shield, CheckCircle, Loader2, Users, Sparkles, RefreshCw } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useAuth } from '@/lib/auth';

interface PhoneVerificationProps {
  phoneNumber: string;
  onChange: (phone: string) => void;
  onVerified?: () => void;
}

export function PhoneVerification({ phoneNumber, onChange, onVerified }: PhoneVerificationProps) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [generatingBg, setGeneratingBg] = useState(false);
  const [bgStyle, setBgStyle] = useState<'neon' | 'nature' | 'minimal' | 'cosmic' | 'geometric' | 'aurora'>('neon');

  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (phone.startsWith('+')) {
      return `+${cleaned}`;
    }
    return `+1${cleaned}`;
  };

  const generateBackground = async (style?: string) => {
    setGeneratingBg(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-background', {
        body: { style: style || bgStyle },
      });

      if (error) throw error;
      if (data?.imageUrl) {
        setBackgroundUrl(data.imageUrl);
      }
    } catch (error: any) {
      console.error('Background generation error:', error);
      toast.error('Failed to generate background');
    } finally {
      setGeneratingBg(false);
    }
  };

  const handleSendCode = async () => {
    if (!phoneNumber) return;
    setLoading(true);
    
    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);
      
      const { data, error } = await supabase.functions.invoke('send-sms-code', {
        body: { phone: formattedPhone },
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
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
      
      const { data, error } = await supabase.functions.invoke('verify-sms-code', {
        body: { 
          phone: formattedPhone, 
          code,
          userId: profile?.id,
        },
      });
      
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      
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

  const styles: Array<{ key: typeof bgStyle; label: string; gradient: string }> = [
    { key: 'neon', label: 'Neon', gradient: 'from-pink-500 via-purple-500 to-cyan-500' },
    { key: 'nature', label: 'Nature', gradient: 'from-green-400 via-emerald-500 to-teal-500' },
    { key: 'minimal', label: 'Minimal', gradient: 'from-slate-300 via-zinc-400 to-stone-400' },
    { key: 'cosmic', label: 'Cosmic', gradient: 'from-purple-600 via-indigo-600 to-blue-800' },
    { key: 'geometric', label: 'Geometric', gradient: 'from-orange-400 via-red-500 to-pink-500' },
    { key: 'aurora', label: 'Aurora', gradient: 'from-green-300 via-blue-500 to-purple-600' },
  ];

  if (verified) {
    return (
      <div className="space-y-6 relative min-h-[400px] rounded-2xl overflow-hidden">
        {/* AI Generated Background */}
        {backgroundUrl && (
          <div 
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${backgroundUrl})` }}
          >
            <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" />
          </div>
        )}
        
        <div className="relative z-10">
          <div className="text-center">
            <h2 className="text-2xl font-bold gradient-text">{t('onboarding.step5Title')}</h2>
            <p className="text-muted-foreground mt-2">{t('onboarding.step5Subtitle')}</p>
          </div>
          
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center gap-4 p-6 rounded-xl bg-card/80 backdrop-blur-md border border-primary/20 mt-6"
          >
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-primary-foreground" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-lg">Phone Verified!</p>
              <p className="text-sm text-muted-foreground">{phoneNumber}</p>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative min-h-[500px] rounded-2xl overflow-hidden">
      {/* AI Generated Background */}
      <AnimatePresence mode="wait">
        {backgroundUrl && (
          <motion.div 
            key={backgroundUrl}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${backgroundUrl})` }}
          >
            <div className="absolute inset-0 bg-background/70 backdrop-blur-[2px]" />
          </motion.div>
        )}
      </AnimatePresence>
      
      <div className="relative z-10 p-4 sm:p-6">
        <div className="text-center">
          <h2 className="text-xl sm:text-2xl font-bold gradient-text">{t('onboarding.step5Title')}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t('onboarding.step5Subtitle')}</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4 mt-4"
        >
          {/* AI Background Generator */}
          <div className="p-3 sm:p-4 rounded-xl bg-card/80 backdrop-blur-md border border-border/50">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium">AI Background</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => generateBackground()}
                disabled={generatingBg}
                className="h-7 px-2 text-xs"
              >
                {generatingBg ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
              </Button>
            </div>
            
            <div className="flex flex-wrap gap-1.5">
              {styles.map((style) => (
                <button
                  key={style.key}
                  onClick={() => {
                    setBgStyle(style.key);
                    generateBackground(style.key);
                  }}
                  className={`px-2 py-1 text-xs rounded-full bg-gradient-to-r ${style.gradient} transition-all ${
                    bgStyle === style.key ? 'ring-2 ring-white ring-offset-2 ring-offset-background' : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <span className="text-white font-medium drop-shadow">{style.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Benefits - Compact */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: Shield, text: 'Recovery' },
              { icon: CheckCircle, text: 'Verified' },
              { icon: Users, text: 'Find Friends' },
            ].map((benefit, i) => (
              <div key={i} className="flex flex-col items-center gap-1 p-2 rounded-lg bg-card/80 backdrop-blur-md border border-border/50">
                <benefit.icon className="w-4 h-4 text-primary" />
                <span className="text-xs text-center">{benefit.text}</span>
              </div>
            ))}
          </div>

          {/* Phone Input */}
          <div className="space-y-3 p-3 sm:p-4 rounded-xl bg-card/80 backdrop-blur-md border border-border/50">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={phoneNumber}
                  onChange={(e) => onChange(e.target.value)}
                  className="pl-10 bg-background/50 border-border/50 h-10 text-sm"
                  disabled={codeSent}
                />
              </div>
              {!codeSent && (
                <Button 
                  onClick={handleSendCode}
                  disabled={!phoneNumber || loading}
                  className="gradient-animated h-10 px-3 text-sm"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Send'
                  )}
                </Button>
              )}
            </div>

            {codeSent && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-3"
              >
                <p className="text-xs text-muted-foreground text-center">
                  Enter the 6-digit code sent to {phoneNumber}
                </p>
                
                <div className="flex flex-col items-center gap-3">
                  <InputOTP
                    maxLength={6}
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
                      disabled={loading}
                      className="h-9 px-3 text-sm bg-background/50"
                    >
                      Resend
                    </Button>
                  </div>
                </div>
                
                <Button
                  variant="link"
                  className="p-0 h-auto text-xs w-full"
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
          <p className="text-center text-xs text-muted-foreground">
            Optional - add your phone later in Settings
          </p>
        </motion.div>
      </div>
    </div>
  );
}

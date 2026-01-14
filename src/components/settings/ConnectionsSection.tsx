import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link2, Phone, Check, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { getUserFriendlyError } from '@/lib/errorUtils';
import { supabase } from '@/integrations/supabase/client';
import { haptics } from '@/lib/haptics';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

export function ConnectionsSection() {
  const { profile } = useAuth();
  const [googleLinked, setGoogleLinked] = useState(false);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [showPhoneInput, setShowPhoneInput] = useState(false);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingGoogle, setCheckingGoogle] = useState(true);

  useEffect(() => {
    const checkGoogleLink = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const googleIdentity = user.identities?.find(
            (identity) => identity.provider === 'google'
          );
          if (googleIdentity) {
            setGoogleLinked(true);
            setGoogleEmail(googleIdentity.identity_data?.email || null);
          }
        }
      } catch (error) {
        console.error('Error checking Google link:', error);
      } finally {
        setCheckingGoogle(false);
      }
    };
    checkGoogleLink();
  }, []);

  useEffect(() => {
    if (profile?.id) {
      supabase
        .from('profiles')
        .select('phone_number, phone_verified')
        .eq('id', profile.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setPhoneNumber(data.phone_number || '');
            setPhoneVerified(data.phone_verified ?? false);
          }
        });
    }
  }, [profile?.id]);

  const handleConnectGoogle = async () => {
    haptics.tap();
    setLoading(true);
    try {
      const { error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/settings`,
        },
      });
      if (error) throw error;
    } catch (error: any) {
      toast.error(getUserFriendlyError(error));
      setLoading(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    haptics.tap();
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      
      const googleIdentity = user.identities?.find(
        (identity) => identity.provider === 'google'
      );
      
      if (googleIdentity) {
        const { error } = await supabase.auth.unlinkIdentity(googleIdentity);
        if (error) throw error;
        
        setGoogleLinked(false);
        setGoogleEmail(null);
        haptics.success();
        toast.success('Google account disconnected');
      }
    } catch (error: any) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleSavePhone = async () => {
    if (!profile?.id || !phoneNumber) return;
    haptics.tap();
    setLoading(true);
    
    try {
      const formattedPhone = phoneNumber.startsWith('+') 
        ? phoneNumber 
        : `+1${phoneNumber.replace(/\D/g, '')}`;
      
      const { error: authError } = await supabase.auth.updateUser({
        phone: formattedPhone,
      });
      
      if (authError) throw authError;
      
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ 
          phone_number: formattedPhone,
          phone_verified: false,
        })
        .eq('id', profile.id);
      
      if (profileError) throw profileError;
      
      setShowPhoneInput(false);
      setShowOtpInput(true);
      toast.success('Verification code sent to your phone');
    } catch (error: any) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!profile?.id || otp.length !== 6) return;
    haptics.tap();
    setLoading(true);
    
    try {
      const formattedPhone = phoneNumber.startsWith('+') 
        ? phoneNumber 
        : `+1${phoneNumber.replace(/\D/g, '')}`;
      
      const { error } = await supabase.auth.verifyOtp({
        phone: formattedPhone,
        token: otp,
        type: 'sms',
      });
      
      if (error) throw error;
      
      await supabase
        .from('profiles')
        .update({ phone_verified: true })
        .eq('id', profile.id);
      
      setPhoneVerified(true);
      setShowOtpInput(false);
      setOtp('');
      haptics.success();
      toast.success('Phone number verified!');
    } catch (error: any) {
      haptics.error();
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePhone = async () => {
    if (!profile?.id) return;
    haptics.tap();
    setLoading(true);
    
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ 
          phone_number: null,
          phone_verified: false,
        })
        .eq('id', profile.id);
      
      if (error) throw error;
      
      setPhoneNumber('');
      setPhoneVerified(false);
      haptics.success();
      toast.success('Phone number removed');
    } catch (error: any) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="liquid-glass-card p-4 sm:p-6"
    >
      <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm sm:text-base">
        <Link2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
        Account Connections
      </h3>

      {/* Google Connection */}
      <div className="py-3 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0 mr-3">
            <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm sm:text-base">Google</p>
              {checkingGoogle ? (
                <p className="text-xs text-muted-foreground">Checking...</p>
              ) : googleLinked ? (
                <p className="text-xs text-muted-foreground truncate">{googleEmail || 'Connected'}</p>
              ) : (
                <p className="text-xs text-muted-foreground">Not connected</p>
              )}
            </div>
          </div>
          {!checkingGoogle && (
            googleLinked ? (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleDisconnectGoogle}
                disabled={loading}
                className="flex-shrink-0"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 mr-1" />}
                Disconnect
              </Button>
            ) : (
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleConnectGoogle}
                disabled={loading}
                className="flex-shrink-0"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Connect'}
              </Button>
            )
          )}
        </div>
      </div>

      {/* Phone Number */}
      <div className="py-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 flex-1 min-w-0 mr-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Phone className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-medium text-sm sm:text-base">Phone Number</p>
              {phoneNumber && !showPhoneInput ? (
                <div className="flex items-center gap-1">
                  <p className="text-xs text-muted-foreground truncate">{phoneNumber}</p>
                  {phoneVerified && <Check className="w-3 h-3 text-green-500 flex-shrink-0" />}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Add for account recovery</p>
              )}
            </div>
          </div>
          {!showPhoneInput && !showOtpInput && (
            phoneNumber ? (
              <div className="flex gap-2 flex-shrink-0">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowPhoneInput(true)}
                  disabled={loading}
                >
                  Edit
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleRemovePhone}
                  disabled={loading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setShowPhoneInput(true)}
                disabled={loading}
                className="flex-shrink-0"
              >
                Add
              </Button>
            )
          )}
        </div>

        {showPhoneInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-3 ml-13"
          >
            <div className="flex gap-2">
              <Input
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleSavePhone} disabled={loading || !phoneNumber}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
              </Button>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => setShowPhoneInput(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              We'll send a verification code to this number
            </p>
          </motion.div>
        )}

        {showOtpInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-3 ml-13"
          >
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code sent to {phoneNumber}
            </p>
            <div className="flex gap-2 items-center">
              <InputOTP
                maxLength={6}
                value={otp}
                onChange={setOtp}
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
              <Button onClick={handleVerifyOtp} disabled={loading || otp.length !== 6}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Verify'}
              </Button>
            </div>
            <Button 
              variant="link" 
              size="sm"
              onClick={() => {
                setShowOtpInput(false);
                setShowPhoneInput(true);
                setOtp('');
              }}
              className="p-0 h-auto"
            >
              Use a different number
            </Button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

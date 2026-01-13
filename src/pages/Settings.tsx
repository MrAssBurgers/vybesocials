import { useState, useEffect, forwardRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { LogOut, ChevronRight, Globe, Moon, Sun, Monitor, Sparkles, MessageSquareHeart, Lock, Vibrate, Volume2, Zap, Layers, Contrast, Bell, Phone, Link2, Check, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { useGlassIntensity } from '@/components/ui/glass/GlassIntensityProvider';
import { languages } from '@/lib/i18n';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { getUserFriendlyError } from '@/lib/errorUtils';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { haptics } from '@/lib/haptics';
import { useNotificationPreferences, useUpdateNotificationPreference } from '@/hooks/useNotificationPreferences';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

const SettingsPage = forwardRef<HTMLDivElement, {}>(function SettingsPage(_, ref) {
  const { t, i18n } = useTranslation();
  const { profile, signOut, updateProfile } = useAuth();
  const { 
    theme, setTheme, 
    reducedMotion, setReducedMotion,
    motionIntensity, setMotionIntensity,
    hapticsEnabled, setHapticsEnabled,
    soundsEnabled, setSoundsEnabled,
  } = useTheme();
  const { intensity, setIntensity, contrast, setContrast } = useGlassIntensity();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: profile?.username || '',
    bio: profile?.bio || '',
  });
  const [isPrivate, setIsPrivate] = useState(false);
  const [privacyLoading, setPrivacyLoading] = useState(false);

  // Fetch current privacy setting
  useEffect(() => {
    if (profile?.id) {
      supabase
        .from('profiles')
        .select('is_private')
        .eq('id', profile.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setIsPrivate(data.is_private ?? false);
          }
        });
    }
  }, [profile?.id]);

  const handleSave = async () => {
    setLoading(true);
    haptics.select();
    try {
      const { error } = await updateProfile({
        username: formData.username,
        bio: formData.bio,
      });
      if (error) throw error;
      haptics.success();
      toast.success(t('common.save') + ' ✓');
    } catch (error: any) {
      haptics.error();
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  const handlePrivacyChange = async (value: boolean) => {
    if (!profile?.id) return;
    setPrivacyLoading(true);
    haptics.tap();
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_private: value })
        .eq('id', profile.id);
      
      if (error) throw error;
      setIsPrivate(value);
      toast.success(value ? 'Account set to private' : 'Account set to public');
    } catch (error: any) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setPrivacyLoading(false);
    }
  };

  const handleSignOut = async () => {
    haptics.impact();
    await signOut();
    navigate('/');
  };

  const changeLanguage = (code: string) => {
    haptics.tap();
    i18n.changeLanguage(code);
    toast.success('Language changed!');
  };

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <h1 className="text-xl sm:text-2xl font-bold mb-4">{t('settings.title')}</h1>

        {/* Quick Profile Access */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4"
        >
          <Link 
            to={`/u/${profile?.username}`}
            className="liquid-glass-card p-4 flex items-center justify-between hover:bg-muted/50 transition-colors active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12 ring-2 ring-primary/20">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="text-lg bg-secondary">
                  {profile?.username?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h2 className="font-semibold truncate">@{profile?.username}</h2>
                <p className="text-xs text-muted-foreground">View your profile</p>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          </Link>
        </motion.div>

        {/* Profile Edit Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="liquid-glass-card p-4 sm:p-6 mb-4 sm:mb-6"
        >
          <h3 className="font-semibold mb-4 text-sm sm:text-base">{t('profile.editProfile')}</h3>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium">{t('auth.username')}</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio" className="text-sm font-medium">{t('onboarding.bio')}</Label>
              <Textarea
                id="bio"
                placeholder="Tell us about yourself..."
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                rows={3}
                maxLength={150}
              />
              <p className="text-xs text-muted-foreground text-right">
                {formData.bio.length}/150
              </p>
            </div>

            <Button onClick={handleSave} disabled={loading} className="w-full">
              {loading ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </motion.section>

        {/* Privacy Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="liquid-glass-card p-4 sm:p-6 mb-4 sm:mb-6"
        >
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm sm:text-base">
            <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            {t('settings.privacy')}
          </h3>

          <div className="flex items-center justify-between py-3">
            <div className="flex-1 min-w-0 mr-4">
              <p className="font-medium text-sm sm:text-base">{t('settings.privateAccount')}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">{t('settings.privateAccountDesc')}</p>
            </div>
            <Switch 
              checked={isPrivate} 
              onCheckedChange={handlePrivacyChange}
              disabled={privacyLoading}
            />
          </div>
        </motion.section>

        {/* Account Connections Section */}
        <AccountConnectionsSection />

        {/* Appearance Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="liquid-glass-card p-4 sm:p-6 mb-4 sm:mb-6"
        >
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm sm:text-base">
            <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            {t('settings.appearance')}
          </h3>

          {/* Theme Selection */}
          <div className="space-y-3 mb-4">
            <Label className="text-sm font-medium">{t('settings.theme')}</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'dark', icon: Moon, label: t('settings.darkMode') },
                { id: 'light', icon: Sun, label: t('settings.lightMode') },
                { id: 'system', icon: Monitor, label: t('settings.systemDefault') },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    haptics.tap();
                    setTheme(option.id as 'dark' | 'light' | 'system');
                  }}
                  className={cn(
                    'flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all active:scale-95',
                    theme === option.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50 hover:bg-muted/50'
                  )}
                >
                  <option.icon className="w-5 h-5" />
                  <span className="text-xs text-center leading-tight">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Motion Intensity */}
          <div className="space-y-2 sm:space-y-3 mb-4">
            <Label className="text-sm flex items-center gap-2">
              <Zap className="w-4 h-4" />
              Motion Intensity
            </Label>
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              {[
                { id: 'calm', label: 'Calm' },
                { id: 'normal', label: 'Normal' },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    haptics.tap();
                    setMotionIntensity(option.id as 'calm' | 'normal');
                  }}
                  className={cn(
                    'p-2 sm:p-3 rounded-lg border transition-all text-sm active:scale-95',
                    motionIntensity === option.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Glass Intensity */}
          <div className="space-y-2 sm:space-y-3 mb-4 pt-4 border-t border-border">
            <Label className="text-sm flex items-center gap-2">
              <Layers className="w-4 h-4" />
              Glass Intensity
            </Label>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {[
                { id: 'calm', label: 'Calm' },
                { id: 'normal', label: 'Normal' },
                { id: 'max', label: 'Max' },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    haptics.tap();
                    setIntensity(option.id as 'calm' | 'normal' | 'max');
                    toast.success(`Glass set to ${option.label}`);
                  }}
                  className={cn(
                    'p-2 sm:p-3 rounded-lg border transition-all text-sm active:scale-95',
                    intensity === option.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {/* Contrast Mode */}
          <div className="space-y-2 sm:space-y-3 mb-4 pt-4 border-t border-border">
            <Label className="text-sm flex items-center gap-2">
              <Contrast className="w-4 h-4" />
              Contrast Mode
            </Label>
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              {[
                { id: 'normal', label: 'Normal' },
                { id: 'high', label: 'High' },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    haptics.tap();
                    setContrast(option.id as 'normal' | 'high');
                    toast.success(`Contrast set to ${option.label}`);
                  }}
                  className={cn(
                    'p-2 sm:p-3 rounded-lg border transition-all text-sm active:scale-95',
                    contrast === option.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">High contrast improves readability on mobile</p>
          </div>

          {/* Reduced Motion */}
          <div className="flex items-center justify-between py-2 sm:py-3 border-t border-border">
            <div className="min-w-0 flex-1 mr-3">
              <p className="font-medium text-sm sm:text-base">{t('settings.reducedMotion')}</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Reduce all animations</p>
            </div>
            <Switch 
              checked={reducedMotion} 
              onCheckedChange={(checked) => {
                haptics.tap();
                setReducedMotion(checked);
              }} 
            />
          </div>
        </motion.section>

        {/* Feedback & Sounds Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="liquid-glass-card p-4 sm:p-6 mb-4 sm:mb-6"
        >
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm sm:text-base">
            <Vibrate className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            Feedback
          </h3>

          <div className="flex items-center justify-between py-3">
            <div className="min-w-0 flex-1 mr-4">
              <p className="font-medium text-sm sm:text-base">Haptic Feedback</p>
              <p className="text-xs sm:text-sm text-muted-foreground">Vibration on interactions</p>
            </div>
            <Switch 
              checked={hapticsEnabled} 
              onCheckedChange={(checked) => {
                setHapticsEnabled(checked);
                if (checked) haptics.success();
              }} 
            />
          </div>

          <div className="flex items-center justify-between py-3 border-t border-border">
            <div className="min-w-0 flex-1 mr-4">
              <p className="font-medium text-sm sm:text-base flex items-center gap-2">
                <Volume2 className="w-4 h-4" />
                UI Sounds
              </p>
              <p className="text-xs sm:text-sm text-muted-foreground">Subtle interaction sounds</p>
            </div>
            <Switch 
              checked={soundsEnabled} 
              onCheckedChange={(checked) => {
                setSoundsEnabled(checked);
                haptics.tap();
              }} 
            />
          </div>
        </motion.section>

        {/* Notifications Section */}
        <NotificationsSection />

        {/* Language Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="liquid-glass-card p-4 sm:p-6 mb-4 sm:mb-6"
        >
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm sm:text-base">
            <Globe className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            {t('settings.language')}
          </h3>

          <div className="grid grid-cols-2 gap-2">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => changeLanguage(lang.code)}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-xl border-2 transition-all active:scale-95',
                  i18n.language === lang.code
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50 hover:bg-muted/50'
                )}
              >
                <span className="text-xl">{lang.flag}</span>
                <div className="text-left min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{lang.nativeName}</p>
                  <p className="text-xs text-muted-foreground truncate">{lang.name}</p>
                </div>
              </button>
            ))}
          </div>
        </motion.section>

        {/* Feedback Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="liquid-glass-card p-4 sm:p-6 mb-4 sm:mb-6"
        >
          <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm sm:text-base">
            <MessageSquareHeart className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            Feedback
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Help us improve! Share your ideas, report bugs, or vote on features.
          </p>
          <Link to="/feedback">
            <Button variant="outline" className="w-full justify-between">
              <span>Open Feedback Hub</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </motion.section>

        {/* Account Actions */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="space-y-3"
        >
          <Button
            variant="destructive"
            className="w-full justify-between text-sm"
            onClick={handleSignOut}
          >
            <span className="flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              {t('auth.logout')}
            </span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </motion.section>

        {/* App Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center mt-8 sm:mt-12 text-muted-foreground pb-4"
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="gradient-static rounded-lg p-1">
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <span className="font-display font-black text-lg sm:text-xl gradient-text">VYBE</span>
          </div>
          <p className="text-xs sm:text-sm">Version 2.0.0</p>
          <p className="text-[10px] sm:text-xs mt-1">{t('app.tagline')}</p>
        </motion.div>
      </div>
    </AppLayout>
  );
});

export default SettingsPage;

// Notifications Section Component
function NotificationsSection() {
  const { data: prefs, isLoading } = useNotificationPreferences();
  const updatePref = useUpdateNotificationPreference();

  const handleToggle = (key: 'announcements_enabled', value: boolean) => {
    haptics.tap();
    updatePref.mutate({ key, value });
  };

  if (isLoading || !prefs) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.13 }}
      className="liquid-glass-card p-4 sm:p-6 mb-4 sm:mb-6"
    >
      <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm sm:text-base">
        <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
        Notifications
      </h3>

      <div className="flex items-center justify-between py-3">
        <div className="min-w-0 flex-1 mr-4">
          <p className="font-medium text-sm sm:text-base">Announcements</p>
          <p className="text-xs sm:text-sm text-muted-foreground">Receive app announcements and updates</p>
        </div>
        <Switch 
          checked={prefs.announcements_enabled ?? true} 
          onCheckedChange={(checked) => handleToggle('announcements_enabled', checked)}
          disabled={updatePref.isPending}
        />
      </div>
    </motion.section>
  );
}

// Account Connections Section Component
function AccountConnectionsSection() {
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

  // Check if Google is linked on mount
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

  // Fetch phone number from profile
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
      // Format phone number for Supabase
      const formattedPhone = phoneNumber.startsWith('+') 
        ? phoneNumber 
        : `+1${phoneNumber.replace(/\D/g, '')}`;
      
      // Update phone in auth
      const { error: authError } = await supabase.auth.updateUser({
        phone: formattedPhone,
      });
      
      if (authError) throw authError;
      
      // Save to profile
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
      
      // Update profile as verified
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
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.07 }}
      className="liquid-glass-card p-4 sm:p-6 mb-4 sm:mb-6"
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

        {/* Phone Input */}
        {showPhoneInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
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

        {/* OTP Input */}
        {showOtpInput && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
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
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
              </Button>
            </div>
            <Button 
              variant="link" 
              size="sm" 
              className="p-0 h-auto"
              onClick={() => {
                setShowOtpInput(false);
                setShowPhoneInput(true);
                setOtp('');
              }}
            >
              Change phone number
            </Button>
          </motion.div>
        )}
      </div>
    </motion.section>
  );
}

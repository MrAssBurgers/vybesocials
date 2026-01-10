import { useState, useEffect, forwardRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { LogOut, ChevronRight, Globe, Moon, Sun, Monitor, Sparkles, MessageSquareHeart, Lock, Vibrate, Volume2, Zap, Layers, Contrast } from 'lucide-react';
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

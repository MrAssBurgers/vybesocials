import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { LogOut, ChevronRight, Globe, Moon, Sun, Monitor, Sparkles, MessageSquareHeart } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
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

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { profile, signOut, updateProfile } = useAuth();
  const { theme, setTheme, reducedMotion, setReducedMotion } = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: profile?.username || '',
    bio: profile?.bio || '',
  });

  const handleSave = async () => {
    setLoading(true);
    try {
      const { error } = await updateProfile({
        username: formData.username,
        bio: formData.bio,
      });
      if (error) throw error;
      toast.success(t('common.save') + ' ✓');
    } catch (error: any) {
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const changeLanguage = (code: string) => {
    i18n.changeLanguage(code);
    toast.success('Language changed!');
  };

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">{t('settings.title')}</h1>

        {/* Profile Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl border border-border p-6 mb-6"
        >
          <div className="flex items-center gap-4 mb-6">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="text-2xl gradient-animated">
                {profile?.username?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="font-semibold text-lg">@{profile?.username}</h2>
              <p className="text-sm text-muted-foreground">{t('profile.editProfile')}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t('auth.username')}</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">{t('onboarding.bio')}</Label>
              <Textarea
                id="bio"
                placeholder="Tell us about yourself..."
                value={formData.bio}
                onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                className="bg-secondary border-border resize-none"
                rows={3}
                maxLength={150}
              />
              <p className="text-xs text-muted-foreground text-right">
                {formData.bio.length}/150
              </p>
            </div>

            <Button onClick={handleSave} disabled={loading} className="w-full gradient-animated">
              {loading ? t('common.loading') : t('common.save')}
            </Button>
          </div>
        </motion.section>

        {/* Appearance Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card rounded-xl border border-border p-6 mb-6"
        >
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Sun className="w-5 h-5" />
            {t('settings.appearance')}
          </h3>

          {/* Theme Selection */}
          <div className="space-y-3 mb-4">
            <Label>{t('settings.theme')}</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'dark', icon: Moon, label: t('settings.darkMode') },
                { id: 'light', icon: Sun, label: t('settings.lightMode') },
                { id: 'system', icon: Monitor, label: t('settings.systemDefault') },
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => setTheme(option.id as 'dark' | 'light' | 'system')}
                  className={cn(
                    'flex flex-col items-center gap-2 p-3 rounded-lg border transition-all',
                    theme === option.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:border-primary/50'
                  )}
                >
                  <option.icon className="w-5 h-5" />
                  <span className="text-xs">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Reduced Motion */}
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium">{t('settings.reducedMotion')}</p>
              <p className="text-sm text-muted-foreground">Reduce animations</p>
            </div>
            <Switch checked={reducedMotion} onCheckedChange={setReducedMotion} />
          </div>
        </motion.section>

        {/* Language Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-card rounded-xl border border-border p-6 mb-6"
        >
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5" />
            {t('settings.language')}
          </h3>

          <div className="grid grid-cols-2 gap-2">
            {languages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => changeLanguage(lang.code)}
                className={cn(
                  'flex items-center gap-3 p-3 rounded-lg border transition-all',
                  i18n.language === lang.code
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <span className="text-xl">{lang.flag}</span>
                <div className="text-left">
                  <p className="font-medium text-sm">{lang.nativeName}</p>
                  <p className="text-xs text-muted-foreground">{lang.name}</p>
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
          className="bg-card rounded-xl border border-border p-6 mb-6"
        >
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <MessageSquareHeart className="w-5 h-5" />
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
            className="w-full justify-between"
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
          className="text-center mt-12 text-muted-foreground"
        >
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="gradient-animated rounded-lg p-1">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-display font-black text-xl gradient-text">XD</span>
          </div>
          <p className="text-sm">Version 2.0.0</p>
          <p className="text-xs mt-1">{t('app.tagline')}</p>
        </motion.div>
      </div>
    </AppLayout>
  );
}

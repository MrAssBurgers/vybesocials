import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Lock, Eye, EyeOff, Shield, Users, KeyRound, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getUserFriendlyError } from '@/lib/errorUtils';
import { supabase } from '@/integrations/supabase/client';
import { haptics } from '@/lib/haptics';

export function PrivacySection() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [isPrivate, setIsPrivate] = useState(false);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [featureOnLanding, setFeatureOnLanding] = useState(false);
  const [landingLoading, setLandingLoading] = useState(false);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    if (profile?.id) {
      supabase
        .from('profiles')
        .select('is_private, feature_on_landing')
        .eq('id', profile.id)
        .single()
        .then(({ data }) => {
          if (data) {
            setIsPrivate(data.is_private ?? false);
            setFeatureOnLanding((data as any).feature_on_landing ?? false);
          }
        });
    }
  }, [profile?.id]);

  const handleLandingChange = async (value: boolean) => {
    if (!profile?.id) return;
    setLandingLoading(true);
    haptics.tap();
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ feature_on_landing: value } as any)
        .eq('id', profile.id);
      if (error) throw error;
      setFeatureOnLanding(value);
      haptics.success();
      toast.success(value ? "You'll be eligible to be featured on vybe.com" : 'Removed from landing page features');
    } catch (error: any) {
      haptics.error();
      toast.error(getUserFriendlyError(error));
    } finally {
      setLandingLoading(false);
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
      haptics.success();
      toast.success(value ? 'Account set to private' : 'Account set to public');
    } catch (error: any) {
      haptics.error();
      toast.error(getUserFriendlyError(error));
    } finally {
      setPrivacyLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!newPassword || !confirmPassword) {
      toast.error('Please fill in all password fields');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      haptics.success();
      toast.success('Password updated successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      haptics.error();
      toast.error(getUserFriendlyError(error));
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Privacy Overview Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1 text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">Privacy & Security</h3>
            <p className="text-sm text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
              Control who can see your content and interact with you
            </p>
          </div>
        </div>

        {/* Private Account Toggle */}
        <div className="p-4 rounded-xl bg-muted/30 border border-border/50">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center flex-shrink-0 mt-0.5">
                {isPrivate ? (
                  <EyeOff className="w-5 h-5 text-primary" />
                ) : (
                  <Eye className="w-5 h-5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-medium">{t('settings.privateAccount')}</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {t('settings.privateAccountDesc')}
                </p>
              </div>
            </div>
            <Switch 
              checked={isPrivate} 
              onCheckedChange={handlePrivacyChange}
              disabled={privacyLoading}
              className="mt-1"
            />
          </div>
        </div>

        {/* Feature on landing page */}
        <div className="mt-3 p-4 rounded-xl bg-muted/30 border border-border/50">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-background flex items-center justify-center flex-shrink-0 mt-0.5">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-medium">Feature me on the landing page</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  When you're trending today, your avatar can show in the "early members" row on vybehub.app. Only public accounts.
                </p>
              </div>
            </div>
            <Switch
              checked={featureOnLanding}
              onCheckedChange={handleLandingChange}
              disabled={landingLoading || isPrivate}
              className="mt-1"
            />
          </div>
        </div>
      </motion.div>

      {/* Change Password Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <KeyRound className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-base mb-1 text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">Change Password</h3>
            <p className="text-sm text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
              Update your account password
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="bg-muted/30 border-border/50"
              minLength={6}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm New Password</Label>
            <Input
              id="confirm-password"
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="bg-muted/30 border-border/50"
              minLength={6}
            />
          </div>
          <Button
            onClick={handlePasswordChange}
            disabled={passwordLoading || !newPassword || !confirmPassword}
            className="w-full"
          >
            {passwordLoading ? 'Updating...' : 'Update Password'}
          </Button>
        </div>
      </motion.div>

      {/* Current Status */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <h4 className="font-medium mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-muted-foreground" />
          Current Visibility
        </h4>
        
        <div className={`p-4 rounded-xl border-2 ${isPrivate ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/20'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isPrivate ? 'bg-primary' : 'bg-green-500'}`} />
            <div>
              <p className="font-medium">
                {isPrivate ? 'Private Account' : 'Public Account'}
              </p>
              <p className="text-sm text-muted-foreground">
                {isPrivate 
                  ? 'Only approved followers can see your posts'
                  : 'Anyone can see your posts and follow you'
                }
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

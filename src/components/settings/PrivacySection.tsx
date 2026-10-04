import { CloseFriendsManager } from '@/components/stories/CloseFriendsManager';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, Shield, Users, KeyRound, Sparkles, Baby, Megaphone } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { getUserFriendlyError } from '@/lib/errorUtils';
import { db } from '@/lib/firebase';
import { haptics } from '@/lib/haptics';
import { BlockedUsersCard } from './BlockedUsersCard';
import { MutedUsersCard } from './MutedUsersCard';
import { FriendProfileVisibilityCard } from './FriendProfileVisibilityCard';
import { RelationshipEmojiSettings } from './RelationshipEmojiSettings';
import { SettingsSectionCard, SettingsPanel, SettingsToggleRow, SettingsActionRow } from './SettingsUI';
import { getTrackingConsent } from '@/components/app/TrackingConsentDialog';
import { persistTrackingConsent } from '@/lib/att';
import { isNativeAppShell, openAppSettings } from '@/lib/despiaBridge';
import { useAdEligibility } from '@/hooks/useAdEligibility';

export function PrivacySection({ onOpenParental }: { onOpenParental?: () => void } = {}) {
  const { t } = useTranslation();
  const { profile, updateProfile } = useAuth();
  const [isPrivate, setIsPrivate] = useState(false);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [featureOnLanding, setFeatureOnLanding] = useState(false);
  const [landingLoading, setLandingLoading] = useState(false);
  const [adConsent, setAdConsent] = useState(() => getTrackingConsent());
  const [adPrivacyLoading, setAdPrivacyLoading] = useState(false);
  const { isMinor, personalizedAds, consentResolved } = useAdEligibility();
  const nativeShell = isNativeAppShell();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    if (profile?.id) {
      db
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
      const { error } = await updateProfile({ feature_on_landing: value } as any);
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
      const { error } = await db
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

  const handleAdPersonalizationChange = async (value: boolean) => {
    if (isMinor && value) {
      toast.info('Personalized ads are unavailable for accounts under 18');
      return;
    }

    const next = value ? 'allowed' : 'denied';
    setAdPrivacyLoading(true);
    haptics.tap();
    try {
      persistTrackingConsent(next);
      setAdConsent(next);
      if (profile?.id) {
        const { error } = await db
          .from('profiles')
          .update({ tracking_consent: next } as any)
          .eq('id', profile.id);
        if (error) throw error;
      }
      haptics.success();
      toast.success(value ? 'Personalized ads enabled' : 'Ad personalization turned off');
    } catch (error) {
      haptics.error();
      toast.error(getUserFriendlyError(error));
    } finally {
      setAdPrivacyLoading(false);
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
      const { error } = await db.auth.updateUser({ password: newPassword });
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
      <SettingsSectionCard
        icon={Shield}
        title="Privacy & Security"
        description="Control who can see your content and interact with you"
      >
        <SettingsPanel className="space-y-0">
          <SettingsToggleRow
            icon={isPrivate ? EyeOff : Eye}
            title={t('settings.privateAccount')}
            description={t('settings.privateAccountDesc')}
            checked={isPrivate}
            onCheckedChange={handlePrivacyChange}
            disabled={privacyLoading}
          />
          <SettingsToggleRow
            icon={Sparkles}
            title="Feature me on the landing page"
            description="When you're trending today, your avatar can show in the early members row on vybehub.app. Only public accounts."
            checked={featureOnLanding}
            onCheckedChange={handleLandingChange}
            disabled={landingLoading || isPrivate}
          />
        </SettingsPanel>
        {onOpenParental && (
          <div className="mt-3">
            <SettingsActionRow
              icon={<Baby className="w-5 h-5 text-primary" strokeWidth={2.25} />}
              iconClassName="bg-primary/10 ring-1 ring-primary/20"
              title="Parental Controls"
              description="PIN lock, screen-time limits, safer DMs, and content filters"
              onClick={() => {
                haptics.tap();
                onOpenParental();
              }}
            />
          </div>
        )}
      </SettingsSectionCard>

      <SettingsSectionCard
        icon={Megaphone}
        title="Ad Privacy"
        description="Control whether advertising can be personalized"
        delay={0.04}
      >
        <SettingsPanel className="space-y-0">
          {nativeShell ? (
            <SettingsActionRow
              icon={<Shield className="w-5 h-5 text-primary" strokeWidth={2.25} />}
              iconClassName="bg-primary/10 ring-1 ring-primary/20"
              title={isMinor ? 'Personalization off for minors' : 'App tracking permission'}
              description={
                isMinor
                  ? 'Accounts under 18 receive no personalized advertising.'
                  : personalizedAds
                    ? 'Allowed — you can change this any time in device Settings.'
                    : consentResolved
                      ? 'Not allowed — VYBE will not use cross-app tracking for ads.'
                      : 'Not requested yet — no advertising request is sent until you choose.'
              }
              onClick={() => {
                haptics.tap();
                void openAppSettings();
              }}
            />
          ) : (
            <SettingsToggleRow
              icon={Megaphone}
              title="Personalized advertising"
              description={
                isMinor
                  ? 'Unavailable for accounts under 18'
                  : 'Use your ad-consent choice to request more relevant advertising'
              }
              checked={!isMinor && adConsent === 'allowed'}
              onCheckedChange={handleAdPersonalizationChange}
              disabled={adPrivacyLoading || isMinor}
            />
          )}
        </SettingsPanel>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Ads are always labeled. Declining personalization does not affect your ability to use VYBE.
        </p>
      </SettingsSectionCard>

      <SettingsSectionCard
        icon={KeyRound}
        title="Change Password"
        description="Update your account password"
        delay={0.05}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">New Password</Label>
            <Input
              id="new-password"
              type="password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
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
              minLength={6}
            />
          </div>
          <Button
            onClick={handlePasswordChange}
            disabled={passwordLoading || !newPassword || !confirmPassword}
            className="w-full rounded-xl"
          >
            {passwordLoading ? 'Updating...' : 'Update Password'}
          </Button>
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard
        title="Current Visibility"
        delay={0.1}
      >
        <div className={`settings-panel rounded-xl border-2 ${isPrivate ? 'border-primary/40' : 'border-emerald-500/30'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full shrink-0 ${isPrivate ? 'bg-primary' : 'bg-emerald-500'}`} />
            <div>
              <p className="font-medium flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                {isPrivate ? 'Private Account' : 'Public Account'}
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {isPrivate
                  ? 'Only approved followers can see your posts'
                  : 'Anyone can see your posts and follow you'}
              </p>
            </div>
          </div>
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard title="Messages" description="Inbox relationship emojis" delay={0.12}>
        <RelationshipEmojiSettings />
      </SettingsSectionCard>

        <BlockedUsersCard />
        <CloseFriendsManager className="w-full" />
        <MutedUsersCard />
        <FriendProfileVisibilityCard />
    </div>
  );
}

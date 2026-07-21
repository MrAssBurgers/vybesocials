import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Camera, Link, AtSign, Check, X, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { checkUsernameAvailable } from '@/lib/usernameAvailability';

interface ProfileData {
  firstName: string;
  lastName: string;
  displayName: string;
  bio: string;
  linkUrl: string;
  avatarPreview: string | null;
  avatarFile: File | null;
}

interface ProfileSetupProps {
  data: ProfileData;
  onChange: (data: ProfileData) => void;
  username: string;
  onUsernameChange: (username: string) => void;
  onUsernameValidChange: (isValid: boolean) => void;
  authUserId?: string;
  /** Sign in with Apple — name already from Authentication Services; fields optional. */
  nameOptional?: boolean;
}

export function ProfileSetup({
  data,
  onChange,
  username,
  onUsernameChange,
  onUsernameValidChange,
  authUserId,
  nameOptional = false,
}: ProfileSetupProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        onChange({
          ...data,
          avatarPreview: reader.result as string,
          avatarFile: file,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const validateUsername = async (value: string) => {
    setUsernameError('');
    setUsernameAvailable(null);
    onUsernameValidChange(false);

    if (value.length < 3) {
      setUsernameError('Username must be at least 3 characters');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      setUsernameError('Only letters, numbers, and underscores allowed');
      return;
    }

    setCheckingUsername(true);
    try {
      const result = await checkUsernameAvailable(value, authUserId);

      if (result.error) {
        setUsernameError(result.error);
        onUsernameValidChange(false);
        return;
      }

      if (!result.available) {
        setUsernameError('Username is already taken');
        setUsernameAvailable(false);
        onUsernameValidChange(false);
        return;
      }

      setUsernameAvailable(true);
      onUsernameValidChange(true);
    } catch {
      setUsernameError('Error checking username');
      onUsernameValidChange(false);
    } finally {
      setCheckingUsername(false);
    }
  };

  const displayLabel = data.displayName.trim() || [data.firstName, data.lastName].filter(Boolean).join(' ').trim();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold gradient-text">{t('onboarding.step3Title')}</h2>
        <p className="text-muted-foreground mt-2">{t('onboarding.step3Subtitle')}</p>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-4"
      >
        <div className="relative">
          <Avatar className="h-24 w-24 ring-4 ring-primary/20">
            <AvatarImage src={data.avatarPreview || ''} />
            <AvatarFallback className="gradient-animated text-3xl">
              {data.firstName?.[0] || data.displayName?.[0] || username?.[0] || '?'}
            </AvatarFallback>
          </Avatar>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="absolute bottom-0 right-0 p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Camera className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            className="hidden"
          />
        </div>

        {displayLabel ? (
          <p className="text-sm font-medium">{displayLabel}</p>
        ) : null}
        {username ? (
          <p className="text-sm text-muted-foreground">@{username}</p>
        ) : null}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="profileUsername" className="flex items-center gap-2">
            <AtSign className="w-4 h-4" />
            Username *
          </Label>
          <div className="relative">
            <Input
              id="profileUsername"
              placeholder="your_username"
              value={username}
              onChange={(e) => {
                const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
                onUsernameChange(value);
                if (value.length >= 3) {
                  void validateUsername(value);
                } else {
                  setUsernameAvailable(null);
                  setUsernameError(value.length > 0 ? 'Username must be at least 3 characters' : '');
                  onUsernameValidChange(false);
                }
              }}
              className="bg-card border-border pr-10"
              maxLength={20}
              autoComplete="username"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {checkingUsername && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
              {!checkingUsername && usernameAvailable === true && <Check className="w-4 h-4 text-primary" />}
              {!checkingUsername && usernameAvailable === false && <X className="w-4 h-4 text-destructive" />}
            </div>
          </div>
          {usernameError && <p className="text-sm text-destructive">{usernameError}</p>}
          {usernameAvailable && !usernameError && (
            <p className="text-sm text-primary">Username is available</p>
          )}
          <p className="text-xs text-muted-foreground">
            Your @username is unique — it&apos;s how people find you, tag you, and share your profile link.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="displayName">
            {t('onboarding.displayName')}
            {nameOptional ? ' (optional)' : ' *'}
          </Label>
          <Input
            id="displayName"
            placeholder="Name shown on your profile"
            value={data.displayName ?? ''}
            onChange={(e) => onChange({ ...data, displayName: e.target.value })}
            className="bg-card border-border"
            autoComplete="name"
          />
          <p className="text-xs text-muted-foreground">
            {nameOptional
              ? 'We use the name from Sign in with Apple when available. You can edit it anytime.'
              : `This is what people see on posts and your profile. It can be different from @${username || 'username'}.`}
          </p>
        </div>

        {/* First & Last Name */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name{nameOptional ? ' (optional)' : ' *'}</Label>
            <Input
              id="firstName"
              placeholder="First name"
              value={data.firstName}
              onChange={(e) => {
                onChange({
                  ...data,
                  firstName: e.target.value,
                });
              }}
              className="bg-card border-border"
              autoComplete="given-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name{nameOptional ? ' (optional)' : ' *'}</Label>
            <Input
              id="lastName"
              placeholder="Last name"
              value={data.lastName}
              onChange={(e) => {
                onChange({
                  ...data,
                  lastName: e.target.value,
                });
              }}
              className="bg-card border-border"
              autoComplete="family-name"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bio">{t('onboarding.bio')}</Label>
          <Textarea
            id="bio"
            placeholder="Tell the world about yourself..."
            value={data.bio}
            onChange={(e) => onChange({ ...data, bio: e.target.value })}
            className="bg-card border-border resize-none"
            rows={3}
            maxLength={150}
          />
          <p className="text-xs text-muted-foreground text-right">{data.bio.length}/150</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="linkUrl" className="flex items-center gap-2">
            <Link className="w-4 h-4" />
            {t('onboarding.linkInBio')}
          </Label>
          <Input
            id="linkUrl"
            placeholder="https://yourwebsite.com"
            value={data.linkUrl}
            onChange={(e) => onChange({ ...data, linkUrl: e.target.value })}
            className="bg-card border-border"
          />
        </div>
      </motion.div>
    </div>
  );
}

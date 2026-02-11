import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Camera, Link } from 'lucide-react';
import { useRef, useState } from 'react';

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
}

export function ProfileSetup({ data, onChange, username }: ProfileSetupProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

        <p className="text-sm text-muted-foreground">@{username}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="space-y-4"
      >
        {/* First & Last Name */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name *</Label>
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
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name *</Label>
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
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="displayName">{t('onboarding.displayName')}</Label>
          <Input
            id="displayName"
            placeholder={username || "Your display name"}
            value={data.displayName || username}
            onChange={(e) => onChange({ ...data, displayName: e.target.value })}
            className="bg-card border-border"
          />
          <p className="text-xs text-muted-foreground">Your @{username} is your display name by default</p>
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

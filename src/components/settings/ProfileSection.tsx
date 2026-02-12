import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Camera, AtSign, FileText, Save, Eye } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { VybeMiniIcon } from '@/components/ui/VybeMiniIcon';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { getUserFriendlyError } from '@/lib/errorUtils';
import { haptics } from '@/lib/haptics';
// Badge settings moved to Profile Locker tab
import { StyledUsername } from '@/components/ui/StyledUsername';
import { useUserPrimaryBadge } from '@/hooks/useBadges';
import { supabase } from '@/integrations/supabase/client';

export function ProfileSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { profile, updateProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: profile?.username || '',
    bio: profile?.bio || '',
  });

  // Keep form in sync when profile data updates (e.g. after save or refetch)
  useEffect(() => {
    if (profile) {
      setFormData({
        username: profile.username || '',
        bio: profile.bio || '',
      });
    }
  }, [profile?.username, profile?.bio]);
  
  // Fetch primary badge for display name styling preview
  const { data: primaryBadge } = useUserPrimaryBadge(profile?.id);

  const handleSave = async () => {
    setLoading(true);
    haptics.select();
    try {
      const { error } = await updateProfile({
        username: formData.username,
        bio: formData.bio,
      });
      if (error) throw error;
      
      // Sync challenges after profile update
      await supabase.rpc('force_sync_my_challenges');
      queryClient.invalidateQueries({ queryKey: ['challenge-progress'] });
      
      haptics.success();
      toast.success('Profile updated successfully!');
    } catch (error: any) {
      haptics.error();
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  const hasChanges = formData.username !== (profile?.username || '') || 
                     formData.bio !== (profile?.bio || '');

  return (
    <div className="space-y-6">
      {/* Profile Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="liquid-glass-card overflow-hidden rounded-xl isolate relative"
      >
        {/* Header with gradient - fully contained with clip-path */}
        <div 
          className="h-20 bg-gradient-to-r from-primary/30 via-primary/20 to-accent/30" 
          style={{ 
            borderTopLeftRadius: 'inherit', 
            borderTopRightRadius: 'inherit',
            clipPath: 'inset(0 round var(--radius, 0.75rem) var(--radius, 0.75rem) 0 0)'
          }} 
        />
        
        {/* Profile content */}
        <div className="px-4 sm:px-6 pb-6 -mt-10">
          <Link 
            to={`/u/${profile?.username}`}
            className="block group"
          >
            <div className="flex items-end gap-4">
              <div className="relative">
                <Avatar className="h-20 w-20 ring-4 ring-background shadow-xl">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-2xl bg-primary text-primary-foreground font-bold">
                    {profile?.username?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-0.5 -right-0.5 z-20 bg-accent rounded-full p-[3px] border-2 border-background flex items-center justify-center shadow-[0_1px_4px_rgba(0,0,0,0.3)]">
                  <Camera className="h-3 w-3 text-accent-foreground" strokeWidth={2.5} />
                </div>
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-2">
                  <StyledUsername
                    userId={profile?.id || ''}
                    username={profile?.username || 'username'}
                    displayName={profile?.display_name}
                    className="font-bold text-lg truncate"
                    showAtSymbol={true}
                    preferDisplayName={false}
                  />
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <p className="text-sm text-foreground/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">View your public profile</p>
              </div>
            </div>
          </Link>
        </div>
      </motion.div>

      {/* Edit Form */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <h3 className="font-semibold mb-6 text-base text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">Edit Profile</h3>

        <div className="space-y-5">
          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username" className="text-sm font-medium flex items-center gap-2">
              <AtSign className="w-4 h-4 text-muted-foreground" />
              {t('auth.username')}
            </Label>
            <Input
              id="username"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              placeholder="your_username"
              className="h-11 text-foreground placeholder:text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">
              This is your unique identifier on VYBE
            </p>
          </div>

          {/* Bio */}
          <div className="space-y-2">
            <Label htmlFor="bio" className="text-sm font-medium flex items-center gap-2">
              <FileText className="w-4 h-4 text-muted-foreground" />
              {t('onboarding.bio')}
            </Label>
            <Textarea
              id="bio"
              placeholder="Tell the world about yourself..."
              value={formData.bio}
              onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
              rows={4}
              maxLength={150}
              className="resize-none text-foreground placeholder:text-muted-foreground"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Write a short bio to introduce yourself
              </p>
              <span className={`text-xs ${formData.bio.length > 130 ? 'text-warning' : 'text-muted-foreground'}`}>
                {formData.bio.length}/150
              </span>
            </div>
          </div>

          {/* Save Button */}
          <Button 
            onClick={handleSave} 
            disabled={loading || !hasChanges} 
            className="w-full h-11 gap-2"
          >
            <Save className="w-4 h-4" />
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </motion.div>

      {/* Display Name Preview - Live Preview */}
      {primaryBadge && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="liquid-glass-card p-4 sm:p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <Eye className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Display Name Preview</h3>
          </div>
          
          <div className="p-4 rounded-xl bg-secondary/30 border border-border/50">
            <p className="text-xs text-muted-foreground mb-2">How others see your name:</p>
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="bg-primary text-primary-foreground">
                  {profile?.username?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div>
                <StyledUsername
                  userId={profile?.id || ''}
                  username={profile?.username || 'username'}
                  displayName={profile?.display_name}
                  className="text-lg font-bold"
                />
                <p className="text-xs text-muted-foreground">@{profile?.username}</p>
              </div>
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
            <VybeMiniIcon size={12} showSparkles />
            Your name styling is based on your highest-priority badge
          </p>
        </motion.div>
      )}

      {/* Badge settings moved to Profile → Locker tab */}
    </div>
  );
}

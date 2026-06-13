import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Camera, AtSign, FileText, Save, Eye, User } from 'lucide-react';
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
import { invalidateConversationCaches } from '@/lib/invalidateConversationCaches';
import { haptics } from '@/lib/haptics';
// Badge settings moved to Profile Locker tab
import { StyledUsername } from '@/components/ui/StyledUsername';
import { useUserPrimaryBadge } from '@/hooks/useBadges';
import { supabase } from '@/integrations/supabase/client';
import { AIProfileWriter } from '@/components/ai/AIProfileWriter';
import { AboutMeSection } from '@/components/settings/AboutMeSection';

export function ProfileSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { profile, updateProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    username: profile?.username || '',
    display_name: profile?.display_name || '',
    bio: profile?.bio || '',
  });

  // Keep form in sync when profile data updates (e.g. after save or refetch)
  useEffect(() => {
    if (profile) {
      setFormData({
        username: profile.username || '',
        display_name: profile.display_name || '',
        bio: profile.bio || '',
      });
    }
  }, [profile?.username, profile?.display_name, profile?.bio]);
  
  // Fetch primary badge for display name styling preview
  const { data: primaryBadge } = useUserPrimaryBadge(profile?.id);

  const handleSave = async () => {
    setLoading(true);
    haptics.select();
    try {
      const trimmedUsername = formData.username.trim().toLowerCase();
      const trimmedDisplay = formData.display_name.trim();

      if (!trimmedUsername) {
        throw new Error('Username cannot be empty');
      }
      if (!/^[a-zA-Z0-9_.]{3,30}$/.test(trimmedUsername)) {
        throw new Error('Username must be 3-30 chars (letters, numbers, _ or .)');
      }

      // If the @ changed, verify it's still available server-side before saving.
      const usernameChanged = trimmedUsername !== (profile?.username || '').toLowerCase();
      if (usernameChanged) {
        const { data: existing, error: checkErr } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', trimmedUsername)
          .maybeSingle();
        if (checkErr) throw checkErr;
        if (existing && existing.id !== profile?.id) {
          throw new Error('That username is already taken');
        }
      }

      const { error } = await updateProfile({
        username: trimmedUsername,
        display_name: trimmedDisplay || null,
        bio: formData.bio,
      } as any);
      if (error) throw error;

      // Show success immediately — the rest is background work.
      haptics.success();
      toast.success(usernameChanged ? `@${trimmedUsername} saved` : 'Profile updated successfully!');

      // Fire-and-forget: challenge sync + cache invalidation should never
      // block the user from seeing their save complete.
      void (async () => {
        try { await supabase.rpc('force_sync_my_challenges'); } catch {}
        queryClient.invalidateQueries({ queryKey: ['challenge-progress'] });
        queryClient.invalidateQueries({ queryKey: ['profile'] });
        queryClient.invalidateQueries({ queryKey: ['profile-by-id'] });
        queryClient.invalidateQueries({ queryKey: ['posts'] });
        queryClient.invalidateQueries({ queryKey: ['comments'] });
        queryClient.invalidateQueries({ queryKey: ['messages'] });
        invalidateConversationCaches(queryClient);
      })();
    } catch (error: any) {
      haptics.error();
      toast.error(getUserFriendlyError(error));
    } finally {
      setLoading(false);
    }
  };

  const hasChanges = formData.username !== (profile?.username || '') || 
                     formData.display_name !== (profile?.display_name || '') ||
                     formData.bio !== (profile?.bio || '');

  return (
    <div className="space-y-6">
      {/* Profile Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="liquid-glass-card overflow-hidden rounded-2xl isolate relative group"
      >
        {/* Soft aurora glows — no hard banner edge */}
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          <div
            className="absolute -top-16 -left-12 w-56 h-56 rounded-full blur-[70px] opacity-35 group-hover:opacity-50 transition-opacity duration-700"
            style={{ background: 'hsl(var(--primary))' }}
          />
          <div
            className="absolute -top-20 right-0 w-64 h-64 rounded-full blur-[80px] opacity-25 group-hover:opacity-40 transition-opacity duration-700"
            style={{ background: 'hsl(var(--accent))' }}
          />
          {/* Hairline gradient on top edge */}
          <div className="absolute top-0 inset-x-6 h-px bg-gradient-to-r from-transparent via-foreground/25 to-transparent" />
        </div>

        <Link to={`/u/${profile?.username}`} className="relative block px-4 sm:px-6 py-5">
          <div className="flex items-center gap-4">
            {/* Avatar with gradient ring */}
            <div className="relative shrink-0">
              <div className="rounded-full p-[2.5px] bg-gradient-to-br from-primary via-accent to-primary shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.6)]">
                <Avatar className="h-[72px] w-[72px] ring-[3px] ring-background">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-2xl bg-primary text-primary-foreground font-bold">
                    {profile?.username?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 z-20 bg-accent rounded-full p-[4px] border-2 border-background flex items-center justify-center shadow-[0_2px_6px_rgba(0,0,0,0.35)]">
                <Camera className="h-3 w-3 text-accent-foreground" strokeWidth={2.5} />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <StyledUsername
                  userId={profile?.id || ''}
                  username={profile?.username || 'username'}
                  displayName={profile?.display_name}
                  className="font-bold text-lg truncate"
                  showAtSymbol={true}
                  preferDisplayName={false}
                />
              </div>
              {profile?.display_name && (
                <p className="text-[13px] font-medium text-foreground/85 truncate">{profile.display_name}</p>
              )}
              <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1">
                <Eye className="h-3 w-3" />
                View your public profile
              </p>
            </div>

            {/* Chevron pill */}
            <div className="shrink-0 h-9 w-9 rounded-full bg-foreground/[0.05] border border-foreground/[0.08] flex items-center justify-center text-muted-foreground group-hover:text-primary group-hover:border-primary/40 group-hover:bg-primary/10 transition-all duration-300">
              <ChevronRight className="h-4 w-4 group-hover:translate-x-[1px] transition-transform" />
            </div>
          </div>
        </Link>
      </motion.div>

      {/* Edit Form */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="liquid-glass-card p-4 sm:p-6"
      >
        <h3 className="font-semibold mb-6 text-base text-foreground">Edit Profile</h3>

        <div className="space-y-5">
          {/* Display Name */}
          <div className="space-y-2">
            <Label htmlFor="display_name" className="text-sm font-medium flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              Display Name
            </Label>
            <Input
              id="display_name"
              value={formData.display_name}
              onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
              placeholder="Your name"
              maxLength={40}
              className="h-11 text-foreground placeholder:text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">
              This is what others see across VYBE. Leave blank to use your username.
            </p>
          </div>

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
              Your unique @handle on VYBE (3–30 chars: letters, numbers, _ or .)
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

            {/* AI Bio Writer */}
            <AIProfileWriter
              currentBio={formData.bio}
              displayName={profile?.display_name || ''}
              onSelectBio={(bio) => setFormData({ ...formData, bio })}
            />
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

      {/* About Me Details */}
      <AboutMeSection />

      {/* Badge settings moved to Profile → Locker tab */}
    </div>
  );
}

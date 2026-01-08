import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LogOut, ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { getUserFriendlyError } from '@/lib/errorUtils';

export default function SettingsPage() {
  const { profile, signOut, updateProfile } = useAuth();
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
      toast.success('Profile updated!');
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

  return (
    <AppLayout>
      <div className="max-w-xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>

        {/* Profile Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-xl border border-border p-6 mb-6"
        >
          <div className="flex items-center gap-4 mb-6">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="text-2xl">
                {profile?.username?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h2 className="font-semibold text-lg">@{profile?.username}</h2>
              <p className="text-sm text-muted-foreground">Edit your profile</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
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

            <Button onClick={handleSave} disabled={loading} className="w-full">
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </motion.section>


        {/* Account Actions */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-3"
        >
          <Button
            variant="destructive"
            className="w-full justify-between"
            onClick={handleSignOut}
          >
            <span className="flex items-center gap-2">
              <LogOut className="h-4 w-4" />
              Sign Out
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
              <span className="text-xl">😂</span>
            </div>
            <span className="font-display font-bold gradient-text">LOLLoop</span>
          </div>
          <p className="text-sm">Version 1.0.0</p>
          <p className="text-xs mt-1">Where funny goes viral</p>
        </motion.div>
      </div>
    </AppLayout>
  );
}

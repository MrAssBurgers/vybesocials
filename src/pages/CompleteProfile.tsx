import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Sparkles, User, Camera } from 'lucide-react';
// Invite mode stage type - must match InviteRedeem state machine
type InviteStage = 'landing' | 'complete-profile' | 'onboarding' | 'home';

interface CompleteProfileProps {
  onInviteNavigate?: (stage: InviteStage) => void;
  isInviteMode?: boolean;
}

export default function CompleteProfile({ onInviteNavigate, isInviteMode = false }: CompleteProfileProps) {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading, authReady } = useAuth();
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [nameError, setNameError] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get Google profile picture if available
  useEffect(() => {
    if (user?.user_metadata?.avatar_url) {
      setAvatarPreview(user.user_metadata.avatar_url);
    }
  }, [user]);

  // Helper function for navigation - uses callback in invite mode
  const navTo = (stage: InviteStage, fallbackPath: string) => {
    if (isInviteMode && onInviteNavigate) {
      onInviteNavigate(stage);
    } else {
      navigate(fallbackPath, { replace: true });
    }
  };

  useEffect(() => {
    // CRITICAL: Wait for authReady before any redirect logic
    if (!authReady) return;
    
    // If user already has a profile with a username, proceed to next step
    if (user && profile?.username) {
      if (profile.onboarding_completed) {
        navTo('home', '/home');
      } else {
        navTo('onboarding', '/onboarding');
      }
    }
  }, [authReady, user, profile, navigate, isInviteMode, onInviteNavigate]);

  useEffect(() => {
    // CRITICAL: Wait for authReady before redirect
    if (!authReady) return;
    
    // Redirect if not authenticated
    if (!user) {
      navTo('landing', '/');
    }
  }, [authReady, user, navigate, isInviteMode, onInviteNavigate]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image must be less than 5MB');
        return;
      }
      setAvatarFile(file);
      setAvatarPreview(URL.createObjectURL(file));
    }
  };

  const validateUsername = async (value: string) => {
    setUsernameError('');
    
    if (value.length < 3) {
      setUsernameError('Username must be at least 3 characters');
      return false;
    }
    
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      setUsernameError('Username can only contain letters, numbers, and underscores');
      return false;
    }

    // Check if username is taken
    const { data } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', value.toLowerCase())
      .maybeSingle();

    if (data) {
      setUsernameError('Username is already taken');
      return false;
    }

    return true;
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile || !user) return null;

    const fileExt = avatarFile.name.split('.').pop();
    const filePath = `${user.id}/avatar.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, avatarFile, { upsert: true });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return null;
    }

    const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validate first and last name
    if (!firstName.trim() || !lastName.trim()) {
      setNameError('First and last name are required');
      return;
    }
    setNameError('');

    setLoading(true);
    try {
      const isValid = await validateUsername(username);
      if (!isValid) {
        setLoading(false);
        return;
      }

      // Upload avatar if selected
      let avatarUrl = avatarPreview;
      if (avatarFile) {
        const uploadedUrl = await uploadAvatar();
        if (uploadedUrl) {
          avatarUrl = uploadedUrl;
        }
      }

      // Create or update profile
      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          username: username.toLowerCase(),
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          display_name: `${firstName.trim()} ${lastName.trim()}`,
          bio: bio,
          avatar_url: avatarUrl,
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      toast.success('Profile created! 🎉');
      navTo('onboarding', '/onboarding');
    } catch (error: any) {
      console.error('Error creating profile:', error);
      toast.error('Failed to create profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        >
          <Sparkles className="w-8 h-8 text-primary" />
        </motion.div>
      </div>
    );
  }

  // If the profile is already set up, never show this screen (prevents flashes)
  if (user && profile?.username) {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
          className="absolute -top-1/2 -left-1/2 w-full h-full opacity-20"
        >
          <div className="w-full h-full gradient-animated rounded-full blur-3xl" />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="glass-card rounded-2xl p-8 gradient-border">
          <div className="text-center mb-8">
            {/* Avatar upload */}
            <div className="relative inline-block mb-4">
              <Avatar className="w-24 h-24 border-4 border-primary/20">
                <AvatarImage src={avatarPreview || undefined} />
                <AvatarFallback className="bg-secondary">
                  <User className="w-10 h-10 text-muted-foreground" />
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
            <h1 className="text-2xl font-bold">Complete Your Profile</h1>
            <p className="text-muted-foreground mt-2">
              Choose a username to get started
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* First & Last Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name *</Label>
                <Input
                  id="firstName"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    setNameError('');
                  }}
                  className="bg-secondary border-border"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name *</Label>
                <Input
                  id="lastName"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    setNameError('');
                  }}
                  className="bg-secondary border-border"
                  required
                />
              </div>
            </div>
            {nameError && (
              <p className="text-sm text-destructive -mt-4">{nameError}</p>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">Username *</Label>
              <Input
                id="username"
                placeholder="Choose a unique username"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setUsernameError('');
                }}
                onBlur={() => username && validateUsername(username)}
                className="bg-secondary border-border"
                required
              />
              {usernameError && (
                <p className="text-sm text-destructive">{usernameError}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio (optional)</Label>
              <Textarea
                id="bio"
                placeholder="Tell us about yourself..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="bg-secondary border-border resize-none"
                rows={3}
              />
            </div>

            <Button
              type="submit"
              className="w-full gradient-animated text-white font-semibold"
              size="lg"
              disabled={loading || !username || !firstName || !lastName}
            >
              {loading ? 'Creating...' : 'Continue'}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

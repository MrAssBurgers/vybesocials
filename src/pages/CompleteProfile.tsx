import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Sparkles, User } from 'lucide-react';

export default function CompleteProfile() {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [usernameError, setUsernameError] = useState('');

  useEffect(() => {
    // If user already has a profile with a username, redirect to onboarding or home
    if (!authLoading && profile?.username) {
      if (profile.onboarding_completed) {
        navigate('/home');
      } else {
        navigate('/onboarding');
      }
    }
  }, [authLoading, profile, navigate]);

  useEffect(() => {
    // Redirect if not authenticated
    if (!authLoading && !user) {
      navigate('/');
    }
  }, [authLoading, user, navigate]);

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
    const { data, error } = await supabase
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const isValid = await validateUsername(username);
      if (!isValid) {
        setLoading(false);
        return;
      }

      // Create or update profile
      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          username: username.toLowerCase(),
          bio: bio,
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      toast.success('Profile created! 🎉');
      navigate('/onboarding');
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
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full gradient-animated mb-4">
              <User className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold">Complete Your Profile</h1>
            <p className="text-muted-foreground mt-2">
              Choose a username to get started
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
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
              disabled={loading || !username}
            >
              {loading ? 'Creating...' : 'Continue'}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

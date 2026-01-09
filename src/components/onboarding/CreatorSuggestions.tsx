import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Crown, UserPlus } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

// Owner username constant
const OWNER_USERNAME = 'mrassburgers';

// Fetch owner profile with follower count
function useOwnerProfile() {
  return useQuery({
    queryKey: ['owner-profile'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, bio')
        .eq('username', OWNER_USERNAME)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) return null;

      // Get follower count
      const { count } = await supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', data.id);

      return { ...data, follower_count: count || 0 };
    },
  });
}

interface CreatorSuggestionsProps {
  interests: string[];
  following: string[];
  onChange: (following: string[]) => void;
}

export function CreatorSuggestions({ following, onChange }: CreatorSuggestionsProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: ownerProfile, isLoading } = useOwnerProfile();

  const followMutation = useMutation({
    mutationFn: async (ownerId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');
      
      const { error } = await supabase
        .from('follows')
        .insert({
          follower_id: profile.id,
          following_id: ownerId,
        });
      
      if (error && !error.message.includes('duplicate')) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('You are now following the owner! 🎉');
    },
    onError: () => {
      toast.error('Failed to follow. Please try again.');
    },
  });

  const handleFollow = () => {
    if (ownerProfile?.id) {
      onChange([ownerProfile.id]);
      followMutation.mutate(ownerProfile.id);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!ownerProfile) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No creators to follow yet. You can skip this step!</p>
      </div>
    );
  }

  const isFollowing = following.includes(ownerProfile.id);

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold gradient-text">Follow the Owner</h2>
        <p className="text-muted-foreground mt-2">
          Stay connected with the app owner for updates and announcements
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-card rounded-2xl border border-border p-6 text-center"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Avatar className="h-24 w-24 border-4 border-primary/20">
              <AvatarImage src={ownerProfile.avatar_url || undefined} />
              <AvatarFallback className="gradient-animated text-2xl">
                {ownerProfile.display_name?.[0] || ownerProfile.username[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 bg-yellow-500 rounded-full p-1.5">
              <Crown className="w-4 h-4 text-white" />
            </div>
          </div>

          <div>
            <h3 className="text-xl font-bold flex items-center justify-center gap-2">
              {ownerProfile.display_name || ownerProfile.username}
            </h3>
            <p className="text-muted-foreground">@{ownerProfile.username}</p>
            <p className="text-sm text-primary font-medium mt-1">
              {ownerProfile.follower_count.toLocaleString()} followers
            </p>
            {ownerProfile.bio && (
              <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
                {ownerProfile.bio}
              </p>
            )}
          </div>

          <Button
            size="lg"
            onClick={handleFollow}
            disabled={isFollowing || followMutation.isPending}
            className={isFollowing ? 'bg-green-600 hover:bg-green-600' : 'gradient-animated'}
          >
            {isFollowing ? (
              '✓ Following'
            ) : (
              <>
                <UserPlus className="w-4 h-4 mr-2" />
                Follow
              </>
            )}
          </Button>
        </div>
      </motion.div>

      <p className="text-center text-sm text-muted-foreground">
        You can also skip this step and follow later from the profile page
      </p>
    </div>
  );
}

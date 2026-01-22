import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Crown, UserPlus, Check, Users } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useFollow } from '@/hooks/useProfile';
import { toast } from 'sonner';

// Owner username constant
const OWNER_USERNAME = 'MrAssBurgers';

// Fetch owner profile from profiles table with follower count (with realtime updates)
function useOwnerProfile() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['owner-profile'],
    queryFn: async () => {
      // Robust lookup (handles case + accidental whitespace in stored usernames)
      const { data: rows, error } = await supabase
        .rpc('get_profile_by_username', { target_username: OWNER_USERNAME });

      if (error) throw error;
      const data = rows?.[0];
      if (!data?.id) return null;

      // Get follower count
      const { count } = await supabase
        .from('follows')
        .select('id', { count: 'exact', head: true })
        .eq('following_id', data.id);

      return { ...data, follower_count: count || 0 };
    },
    refetchInterval: 10000, // Refetch every 10 seconds for live updates
  });

  // Subscribe to realtime follower changes
  useEffect(() => {
    if (!query.data?.id) return;

    const channel = supabase
      .channel(`owner-followers-${query.data.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'follows',
          filter: `following_id=eq.${query.data.id}`,
        },
        () => {
          // Refetch when followers change
          queryClient.invalidateQueries({ queryKey: ['owner-profile'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [query.data?.id, queryClient]);

  return query;
}

// Check if current user is following the owner
function useIsFollowingOwner(ownerId: string | undefined) {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['is-following-owner', profile?.id, ownerId],
    queryFn: async () => {
      if (!profile?.id || !ownerId) return false;
      
      const { data } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', profile.id)
        .eq('following_id', ownerId)
        .maybeSingle();
      
      return !!data;
    },
    enabled: !!profile?.id && !!ownerId,
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
  const {
    data: ownerProfile,
    isLoading,
    isError,
    isFetching,
  } = useOwnerProfile();
  
  const { data: isFollowingOwner } = useIsFollowingOwner(ownerProfile?.id);
  const followMutation = useFollow();

  const handleFollow = async () => {
    if (!ownerProfile?.id || !profile?.id) return;
    
    try {
      await followMutation.mutateAsync({
        targetId: ownerProfile.id,
        isFollowing: isFollowingOwner ?? false,
      });
      
      // Update local state for onboarding
      if (!isFollowingOwner) {
        onChange([...following, ownerProfile.id]);
        toast.success('You are now following the owner! 🎉');
      }
      
      // Invalidate queries to update UI
      queryClient.invalidateQueries({ queryKey: ['is-following-owner'] });
      queryClient.invalidateQueries({ queryKey: ['owner-profile'] });
    } catch {
      toast.error('Failed to follow. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-8">
        <div className="text-center">
          <h2 className="text-2xl font-bold gradient-text">Follow the Owner</h2>
          <p className="text-muted-foreground mt-2">
            Stay connected with the app owner for updates and announcements
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-6">
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-24 w-24 rounded-full" />
            <div className="space-y-2 text-center">
              <Skeleton className="h-6 w-32 mx-auto" />
              <Skeleton className="h-4 w-24 mx-auto" />
              <Skeleton className="h-4 w-20 mx-auto" />
            </div>
            <Skeleton className="h-10 w-28" />
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Couldn't load the owner profile. Please try again.</p>
      </div>
    );
  }

  if (!ownerProfile) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <h2 className="text-2xl font-bold gradient-text">Follow the Owner</h2>
          <p className="text-muted-foreground mt-2">
            Stay connected with the app owner for updates and announcements
          </p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-6 text-center">
          <p className="text-muted-foreground">We couldn't find @{OWNER_USERNAME} yet.</p>
        </div>
      </div>
    );
  }

  const alreadyFollowing = isFollowingOwner || following.includes(ownerProfile.id);
  const followerCount = ownerProfile.follower_count;
  const ownerUsername = (ownerProfile.username || OWNER_USERNAME).trim();

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold gradient-text">Follow the Owner</h2>
        <p className="text-muted-foreground mt-2">
          Stay connected with the app owner for updates and announcements
        </p>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-card rounded-2xl border border-border p-6 text-center"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <Avatar className="h-24 w-24 border-4 border-primary/20">
              <AvatarImage src={ownerProfile.avatar_url || undefined} />
              <AvatarFallback className="gradient-animated text-2xl">
                {(ownerProfile.display_name?.[0] || ownerProfile.username?.[0] || 'O').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 bg-yellow-500 rounded-full p-1.5">
              <Crown className="w-4 h-4 text-white" />
            </div>
          </div>

          <div>
            <h3 className="text-xl font-bold flex items-center justify-center gap-2">
              {ownerProfile.display_name || ownerUsername}
            </h3>
            <p className="text-muted-foreground">@{ownerUsername}</p>
            
            {/* Live follower count with icon */}
            <div className="flex items-center justify-center gap-1.5 mt-2">
              <Users className="w-4 h-4 text-primary" />
              <p className="text-sm text-primary font-medium">
                {isFetching ? (
                  <span className="inline-block w-12 h-4 bg-muted animate-pulse rounded" />
                ) : (
                  <>
                    {followerCount.toLocaleString()} {followerCount === 1 ? 'follower' : 'followers'}
                  </>
                )}
              </p>
            </div>

            {ownerProfile.bio && (
              <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">
                {ownerProfile.bio}
              </p>
            )}
          </div>

          <Button
            size="lg"
            onClick={handleFollow}
            disabled={alreadyFollowing || followMutation.isPending}
            className={alreadyFollowing ? 'bg-green-600 hover:bg-green-600' : 'gradient-animated'}
          >
            {alreadyFollowing ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Following
              </>
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

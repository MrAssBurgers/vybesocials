import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

interface Profile {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  bio: string;
  created_at: string;
  follower_count: number;
  following_count: number;
  post_count: number;
  is_following: boolean;
}

export function useProfileByUsername(username: string) {
  const { profile: currentProfile } = useAuth();

  return useQuery({
    queryKey: ['profile', username, currentProfile?.id],
    queryFn: async (): Promise<Profile | null> => {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .single();

      if (error) return null;

      // Get counts
      const [followerCount, followingCount, postCount, isFollowing] = await Promise.all([
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', profile.id),
        supabase.from('follows').select('id', { count: 'exact', head: true }).eq('follower_id', profile.id),
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', profile.id),
        currentProfile
          ? supabase
              .from('follows')
              .select('id')
              .eq('follower_id', currentProfile.id)
              .eq('following_id', profile.id)
              .single()
          : Promise.resolve({ data: null }),
      ]);

      return {
        ...profile,
        follower_count: followerCount.count || 0,
        following_count: followingCount.count || 0,
        post_count: postCount.count || 0,
        is_following: !!isFollowing.data,
      };
    },
    enabled: !!username,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    gcTime: 1000 * 60 * 15, // Keep in cache for 15 minutes
  });
}

export function useFollow() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ targetId, isFollowing }: { targetId: string; isFollowing: boolean }) => {
      if (!profile) throw new Error('Not authenticated');

      if (isFollowing) {
        await supabase.from('follows').delete().match({
          follower_id: profile.id,
          following_id: targetId,
        });
      } else {
        await supabase.from('follows').insert({
          follower_id: profile.id,
          following_id: targetId,
        });

        // Create notification
        await supabase.from('notifications').insert({
          user_id: targetId,
          type: 'follow',
          actor_id: profile.id,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

export function useUpdateAvatar() {
  const { profile, updateProfile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (file: File) => {
      if (!profile) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.user_id}/avatar.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('media')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(fileName);

      await updateProfile({ avatar_url: publicUrl });

      return publicUrl;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}

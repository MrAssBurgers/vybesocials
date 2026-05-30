import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { setCachedProfile } from '@/lib/profileCache';

interface Profile {
  id: string;
  user_id: string;
  username: string;
  display_name?: string | null;
  avatar_url: string | null;
  bio: string;
  created_at: string;
  date_of_birth?: string | null;
  feature_on_landing?: boolean | null;
  follower_count: number;
  following_count: number;
  post_count: number;
  is_following: boolean;
  is_private?: boolean | null;
  is_verified?: boolean | null;
}

/**
 * Hook to fetch a profile by ID with full stats
 */
export function useProfileById(profileId: string | undefined) {
  const { profile: currentProfile } = useAuth();

  return useQuery({
    queryKey: ['profile-by-id', profileId, currentProfile?.id],
    queryFn: async (): Promise<Profile | null> => {
      if (!profileId) return null;

      let profile: Profile | null = null;

      if (currentProfile) {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, user_id, username, avatar_url, bio, created_at, display_name, link_url, location, is_private, is_verified, interests, language, timezone, coins_balance, onboarding_completed, tutorial_completed, tutorial_skipped, intro_completed, badge_settings, date_of_birth')
          .eq('id', profileId)
          .maybeSingle();
        if (error || !data) {
          console.warn('[useProfileById] Profile not found:', profileId, error?.message);
          return null;
        }
        profile = data as unknown as Profile;
      } else {
        const { data: rows, error } = await supabase.rpc('get_profile_by_id', { target_id: profileId });
        if (error || !rows?.[0]) {
          console.warn('[useProfileById] Profile not found:', profileId, error?.message);
          return null;
        }
        profile = {
          ...rows[0],
          follower_count: 0,
          following_count: 0,
          post_count: 0,
          is_following: false,
        } as Profile;
      }

      if (!profile) return null;

      // Get counts in parallel
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
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      // Cache the profile
      setCachedProfile({
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name || null,
        avatar_url: profile.avatar_url,
      });

      return {
        ...profile,
        follower_count: followerCount.count || 0,
        following_count: followingCount.count || 0,
        post_count: postCount.count || 0,
        is_following: !!isFollowing.data,
      };
    },
    enabled: !!profileId,
    staleTime: 1000 * 60 * 15, // 15 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}

export function useProfileByUsername(username: string) {
  const { profile: currentProfile } = useAuth();

  return useQuery({
    queryKey: ['profile', username, currentProfile?.id],
    queryFn: async (): Promise<Profile | null> => {
      const trimmedUsername = username.trim();
      
      // Try username lookup first
      const { data: profiles, error } = await supabase
        .rpc('get_profile_by_username', { target_username: trimmedUsername });

      let profile = profiles?.[0];
      
      // If not found and looks like a UUID, try ID lookup via RPC (works for guests)
      if (!profile && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmedUsername)) {
        const { data: idProfiles } = await supabase.rpc('get_profile_by_id', { target_id: trimmedUsername });
        if (idProfiles?.[0]) profile = idProfiles[0];
      }
      
      if (error && !profile) {
        console.warn('[useProfile] Profile not found for:', trimmedUsername, error?.message);
        return null;
      }
      
      if (!profile) return null;

      // Direct table read only works for authenticated users (RLS revokes anon SELECT).
      if (currentProfile) {
        const { data: fullProfile } = await supabase
          .from('profiles')
          .select('id, user_id, username, avatar_url, bio, created_at, display_name, link_url, location, is_private, is_verified, interests, language, timezone, coins_balance, onboarding_completed, tutorial_completed, tutorial_skipped, intro_completed, badge_settings, date_of_birth, feature_on_landing')
          .eq('id', profile.id)
          .maybeSingle();

        if (fullProfile) profile = { ...profile, ...fullProfile } as typeof profile;
      }

      // Get counts in parallel
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
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      // Cache the profile
      setCachedProfile({
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name || null,
        avatar_url: profile.avatar_url,
      });

      return {
        ...profile,
        follower_count: followerCount.count || 0,
        following_count: followingCount.count || 0,
        post_count: postCount.count || 0,
        is_following: !!isFollowing.data,
      };
    },
    enabled: !!username,
    staleTime: 1000 * 60 * 15, // 15 minutes
    gcTime: 1000 * 60 * 60, // 1 hour
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
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

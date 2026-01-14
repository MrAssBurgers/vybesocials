import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { ThemeTokens } from './useCustomTheme';

export interface SharedTheme {
  id: string;
  creator_id: string;
  theme_name: string;
  theme_tokens: ThemeTokens;
  description: string | null;
  likes_count: number;
  downloads_count: number;
  is_public: boolean;
  created_at: string;
  creator?: {
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  };
}

// Fetch all public shared themes
export function usePublicThemes() {
  return useQuery({
    queryKey: ['public-themes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shared_themes')
        .select(`
          *,
          creator:profiles!shared_themes_creator_id_fkey(display_name, avatar_url, username)
        `)
        .eq('is_public', true)
        .order('likes_count', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as unknown as SharedTheme[];
    },
    staleTime: 60000,
  });
}

// Fetch user's saved themes
export function useSavedThemes() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['saved-themes', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('saved_themes')
        .select(`
          id,
          created_at,
          shared_theme:shared_themes(
            *,
            creator:profiles!shared_themes_creator_id_fkey(display_name, avatar_url, username)
          )
        `)
        .eq('user_id', user.id) // Use auth user ID
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data?.map(d => ({ ...d.shared_theme, saved_id: d.id })) || []) as unknown as (SharedTheme & { saved_id: string })[];
    },
    enabled: !!user?.id,
    staleTime: 60000,
  });
}

// Fetch user's own shared themes
export function useMySharedThemes() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-shared-themes', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('shared_themes')
        .select('*')
        .eq('creator_id', user.id) // Use auth user ID
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as SharedTheme[];
    },
    enabled: !!user?.id,
    staleTime: 60000,
  });
}

// Share a theme
export function useShareTheme() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      themeName,
      themeTokens,
      description,
    }: {
      themeName: string;
      themeTokens: ThemeTokens;
      description?: string;
    }) => {
      // Use auth user id for creator_id since RLS checks auth.uid()
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('shared_themes')
        .insert({
          creator_id: user.id, // Use auth user ID, not profile ID
          theme_name: themeName,
          theme_tokens: themeTokens as any,
          description: description || null,
          is_public: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-themes'] });
      queryClient.invalidateQueries({ queryKey: ['my-shared-themes'] });
      toast.success('Theme shared with the community!');
    },
    onError: (error: any) => {
      console.error('Failed to share theme:', error);
      toast.error('Failed to share theme');
    },
  });
}

// Save/favorite a theme
export function useSaveSharedTheme() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sharedThemeId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('saved_themes')
        .insert({
          user_id: user.id, // Use auth user ID
          shared_theme_id: sharedThemeId,
        });

      if (error) throw error;

      // Increment download count
      await supabase.rpc('increment_theme_downloads', { theme_id: sharedThemeId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-themes'] });
      toast.success('Theme saved to your collection!');
    },
    onError: (error: any) => {
      if (error.code === '23505') {
        toast.error('Theme already saved');
      } else {
        console.error('Failed to save theme:', error);
        toast.error('Failed to save theme');
      }
    },
  });
}

// Unsave a theme
export function useUnsaveTheme() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sharedThemeId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('saved_themes')
        .delete()
        .eq('user_id', user.id) // Use auth user ID
        .eq('shared_theme_id', sharedThemeId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-themes'] });
      toast.success('Theme removed from collection');
    },
    onError: (error: any) => {
      console.error('Failed to unsave theme:', error);
      toast.error('Failed to remove theme');
    },
  });
}

// Like a theme
export function useLikeTheme() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sharedThemeId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('theme_likes')
        .insert({
          user_id: user.id, // Use auth user ID
          shared_theme_id: sharedThemeId,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-themes'] });
      queryClient.invalidateQueries({ queryKey: ['theme-likes'] });
    },
    onError: (error: any) => {
      if (error.code !== '23505') {
        console.error('Failed to like theme:', error);
      }
    },
  });
}

// Unlike a theme
export function useUnlikeTheme() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sharedThemeId: string) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('theme_likes')
        .delete()
        .eq('user_id', user.id) // Use auth user ID
        .eq('shared_theme_id', sharedThemeId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-themes'] });
      queryClient.invalidateQueries({ queryKey: ['theme-likes'] });
    },
    onError: (error: any) => {
      console.error('Failed to unlike theme:', error);
    },
  });
}

// Check if user has liked themes
export function useUserThemeLikes() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['theme-likes', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('theme_likes')
        .select('shared_theme_id')
        .eq('user_id', user.id); // Use auth user ID

      if (error) throw error;
      return data.map(d => d.shared_theme_id);
    },
    enabled: !!user?.id,
    staleTime: 60000,
  });
}

// Delete a shared theme
export function useDeleteSharedTheme() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (themeId: string) => {
      const { error } = await supabase
        .from('shared_themes')
        .delete()
        .eq('id', themeId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-themes'] });
      queryClient.invalidateQueries({ queryKey: ['my-shared-themes'] });
      toast.success('Theme deleted');
    },
    onError: (error: any) => {
      console.error('Failed to delete theme:', error);
      toast.error('Failed to delete theme');
    },
  });
}

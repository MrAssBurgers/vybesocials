import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { toast } from 'sonner';
import { ThemeTokens } from './useCustomTheme';

export interface SharedTheme {
  id: string;
  creator_id: string;
  theme_name: string;
  theme_tokens: ThemeTokens;
  layout_settings: LayoutSettings | null;
  description: string | null;
  likes_count: number;
  downloads_count: number;
  is_public: boolean;
  created_at: string;
  tags: string[] | null;
  category: string | null;
  creator?: {
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  };
}

export interface LayoutSettings {
  widget_order?: string[];
  widget_hidden?: string[];
  background_url?: string | null;
  corner_style?: string;
  motion_intensity?: string;
  font_heading?: string;
  font_body?: string;
}

// Fetch all public shared themes with search and sorting
export function usePublicThemes(searchQuery?: string) {
  return useQuery({
    queryKey: ['public-themes', searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('shared_themes')
        .select(`
          *,
          creator:profiles!shared_themes_creator_id_fkey(display_name, avatar_url, username)
        `)
        .eq('is_public', true)
        .order('likes_count', { ascending: false })
        .limit(50);

      // Apply search filter if provided
      if (searchQuery && searchQuery.trim()) {
        query = query.ilike('theme_name', `%${searchQuery.trim()}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as unknown as SharedTheme[];
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
  });
}

// Fetch user's saved themes
export function useSavedThemes() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['saved-themes', profileId],
    queryFn: async () => {
      if (!profileId) return [];

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
        .eq('user_id', profileId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data?.map(d => ({ ...d.shared_theme, saved_id: d.id })) || []) as unknown as (SharedTheme & { saved_id: string })[];
    },
    enabled: !!profileId,
    networkMode: 'always',
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
  });
}

// Fetch user's own shared themes
export function useMySharedThemes() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['my-shared-themes', profileId],
    queryFn: async () => {
      if (!profileId) return [];

      const { data, error } = await supabase
        .from('shared_themes')
        .select('*')
        .eq('creator_id', profileId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as SharedTheme[];
    },
    enabled: !!profileId,
    networkMode: 'always',
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
  });
}

// Share a theme - supports public / unlisted / friends-DM / private snapshot
export type ThemeShareVisibility = 'public' | 'unlisted' | 'friends' | 'private';

export function useShareTheme() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      themeName,
      themeTokens,
      description,
      layoutSettings,
      tags,
      category,
      visibility = 'public',
      recipientProfileIds = [],
    }: {
      themeName: string;
      themeTokens: ThemeTokens;
      description?: string;
      layoutSettings?: LayoutSettings;
      tags?: string[];
      category?: string;
      visibility?: ThemeShareVisibility;
      recipientProfileIds?: string[];
    }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('shared_themes')
        .insert({
          creator_id: profile.id,
          theme_name: themeName,
          theme_tokens: themeTokens as any,
          description: description || null,
          layout_settings: layoutSettings ? (layoutSettings as any) : null,
          tags: tags || null,
          category: category || null,
          is_public: visibility === 'public',
        })
        .select()
        .single();

      if (error) throw error;

      if (visibility === 'private') {
        await supabase
          .from('saved_themes')
          .insert({ user_id: profile.id, shared_theme_id: data.id })
          .then(() => {}, () => {});
      }

      if (visibility === 'friends' && recipientProfileIds.length > 0) {
        const { sendThemeToUser } = await import('@/lib/sendShareToUser');
        await Promise.all(
          recipientProfileIds.map((rid) =>
            sendThemeToUser({
              recipientProfileId: rid,
              senderProfileId: profile.id,
              sharedThemeId: data.id,
              themeName,
            })
          )
        );
      }

      return { row: data, visibility };
    },
    onSuccess: ({ visibility }) => {
      queryClient.invalidateQueries({ queryKey: ['public-themes'] });
      queryClient.invalidateQueries({ queryKey: ['my-shared-themes'] });
      queryClient.invalidateQueries({ queryKey: ['saved-themes'] });
      const messages: Record<ThemeShareVisibility, string> = {
        public: 'Theme shared with the community ✨',
        unlisted: 'Unlisted link ready to copy 🔗',
        friends: 'Sent to your friends 💌',
        private: 'Snapshot saved to your gallery',
      };
      toast.success(messages[visibility]);
    },
    onError: (error: any) => {
      console.error('Failed to share theme:', error);
      toast.error('Failed to share theme');
    },
  });
}

// Equip a shared theme: apply tokens live + persist active + auto-save to gallery
export function useEquipSharedTheme() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (theme: { id: string; theme_tokens: ThemeTokens; theme_name: string }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { equipTheme } = await import('@/hooks/useCustomTheme');
      equipTheme(theme.theme_tokens, { themeId: theme.id, silent: true });

      await supabase.from('user_themes').upsert(
        {
          user_id: user.id,
          theme_name: theme.theme_name,
          theme_tokens: theme.theme_tokens as any,
          base_preset: 'shared',
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );

      if (profile?.id) {
        await supabase
          .from('saved_themes')
          .insert({ user_id: profile.id, shared_theme_id: theme.id })
          .then(() => {}, () => {});
        await supabase.rpc('increment_theme_downloads', { theme_id: theme.id }).then(() => {}, () => {});
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-theme'] });
      queryClient.invalidateQueries({ queryKey: ['saved-themes'] });
      toast.success('Equipped ✨');
    },
    onError: (e: any) => {
      console.error('Equip failed', e);
      toast.error('Could not equip theme');
    },
  });
}

// Lookup any shared theme by id (handles unlisted via SECURITY DEFINER RPC)
export function useSharedThemeById(id: string | null | undefined) {
  return useQuery({
    queryKey: ['shared-theme', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.rpc('get_shared_theme_by_id', { p_theme_id: id });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : (data as any);
      if (!row) return null;
      return {
        id: row.id,
        creator_id: row.creator_id,
        theme_name: row.theme_name,
        theme_tokens: row.theme_tokens,
        layout_settings: row.layout_settings,
        description: row.description,
        likes_count: row.likes_count,
        downloads_count: row.downloads_count,
        is_public: row.is_public,
        created_at: row.created_at,
        tags: row.tags,
        category: row.category,
        creator: {
          display_name: row.creator_display_name,
          avatar_url: row.creator_avatar_url,
          username: row.creator_username,
        },
      } as SharedTheme;
    },
    enabled: !!id,
    staleTime: 60_000,
  });
}

// Update a shared theme (for editing name/description)
export function useUpdateSharedTheme() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      themeId,
      themeName,
      description,
    }: {
      themeId: string;
      themeName?: string;
      description?: string;
    }) => {
      const updates: Record<string, any> = {};
      if (themeName !== undefined) updates.theme_name = themeName;
      if (description !== undefined) updates.description = description;

      const { data, error } = await supabase
        .from('shared_themes')
        .update(updates as never)
        .eq('id', themeId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-themes'] });
      queryClient.invalidateQueries({ queryKey: ['my-shared-themes'] });
      toast.success('Theme updated!');
    },
    onError: (error: any) => {
      console.error('Failed to update theme:', error);
      toast.error('Failed to update theme');
    },
  });
}

// Save/favorite a theme
export function useSaveSharedTheme() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sharedThemeId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('saved_themes')
        .insert({
          user_id: profile.id, // Use profile ID
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
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sharedThemeId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('saved_themes')
        .delete()
        .eq('user_id', profile.id) // Use profile ID
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
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sharedThemeId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('theme_likes')
        .insert({
          user_id: profile.id, // Use profile ID
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
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sharedThemeId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('theme_likes')
        .delete()
        .eq('user_id', profile.id) // Use profile ID
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
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['theme-likes', profileId],
    queryFn: async () => {
      if (!profileId) return [];

      const { data, error } = await supabase
        .from('theme_likes')
        .select('shared_theme_id')
        .eq('user_id', profileId);

      if (error) throw error;
      return data.map(d => d.shared_theme_id);
    },
    enabled: !!profileId,
    networkMode: 'always',
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
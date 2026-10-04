import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { toast } from 'sonner';
import type { ThemeTokens } from './useCustomTheme';
import { useEffect, useRef } from 'react';
import { firebaseAuth } from '@/lib/firebase/authService';
import { hasSavedTheme, loadOwnSharedThemes, loadSavedThemes, loadSharedTheme } from '@/lib/sharedThemeRepository';
import { useTheme } from '@/lib/theme';
import { writeDevicePreference } from '@/lib/devicePreferences';

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
      let query = db
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
  const { user } = useAuth();
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['saved-themes', user?.id, profileId],
    queryFn: ({ signal }) => loadSavedThemes(profileId!, { signal }),
    enabled: !!user?.id && !!profileId,
    networkMode: 'always',
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
  });
}

// Fetch user's own shared themes
export function useMySharedThemes() {
  const { user } = useAuth();
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['my-shared-themes', user?.id, profileId],
    queryFn: ({ signal }) => loadOwnSharedThemes(profileId!, { signal }),
    enabled: !!user?.id && !!profileId,
    networkMode: 'always',
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
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

      const { data, error } = await db
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
        await db
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

class ThemeAccountChangedError extends Error {
  constructor() { super('Your account changed. Please select the theme again.'); }
}

type EquipThemeInput = Pick<SharedTheme, 'id' | 'theme_tokens' | 'theme_name'>;
type ThemeAccount = { userId: string | undefined; profileId: string | undefined };

// Persist first; a failed write must not paint or claim an equipped account theme.
export function useEquipSharedTheme() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { setTheme } = useTheme();
  const accountRef = useRef<ThemeAccount>({ userId: user?.id, profileId: profile?.id });
  if (accountRef.current.userId !== user?.id || accountRef.current.profileId !== profile?.id) {
    accountRef.current = { userId: user?.id, profileId: profile?.id };
  }
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const isCurrent = (account: ThemeAccount) => mountedRef.current && accountRef.current === account;
  const assertCurrent = async (account: ThemeAccount) => {
    if (!isCurrent(account)) throw new ThemeAccountChangedError();
    const { data: { user: liveUser } } = await firebaseAuth.getUser();
    if (!isCurrent(account) || liveUser?.id !== account.userId) throw new ThemeAccountChangedError();
  };

  const mutation = useMutation({
    mutationFn: async ({ input, account }: { input: EquipThemeInput; account: ThemeAccount }) => {
      if (!account.userId) throw new Error('Not authenticated');
      await assertCurrent(account);
      // Recheck visibility against the server; stale gallery/detail cache is not authority.
      const theme = await loadSharedTheme(input.id);
      await assertCurrent(account);
      if (!theme) throw new Error('This theme is no longer available');
      const { equipTheme } = await import('@/hooks/useCustomTheme');
      await assertCurrent(account);
      const savedTheme = {
        user_id: account.userId,
        theme_name: theme.theme_name,
        theme_tokens: theme.theme_tokens,
        base_preset: 'shared', is_active: true,
        updated_at: new Date().toISOString(),
      };
      const { error } = await db.from('user_themes').upsert(
        {
          ...savedTheme,
        },
        { onConflict: 'user_id' }
      );
      if (error) throw error;
      await assertCurrent(account);

      let saveFailed = false;
      if (account.profileId) {
        try {
          const alreadySaved = await hasSavedTheme(account.profileId, theme.id);
          await assertCurrent(account);
          if (!alreadySaved) {
            const { error: saveError } = await db.from('saved_themes')
              .insert({ user_id: account.profileId, shared_theme_id: theme.id });
            saveFailed = Boolean(saveError);
          }
        } catch (saveError) {
          if (saveError instanceof ThemeAccountChangedError) throw saveError;
          saveFailed = true;
        }
      }
      await assertCurrent(account);
      setTheme(theme.theme_tokens.mode === 'light' ? 'light' : 'dark');
      equipTheme(theme.theme_tokens, { userId: account.userId, themeId: theme.id, silent: true, skipAutoSave: true });
      writeDevicePreference(`vybe-equipped-theme-id:${account.userId}`, theme.id);
      queryClient.setQueryData(['user-theme', account.userId], savedTheme);
      return { account, theme, saveFailed };
    },
    onSuccess: ({ account, saveFailed }) => {
      if (!isCurrent(account)) return;
      queryClient.invalidateQueries({ queryKey: ['saved-themes', account.userId, account.profileId] });
      if (saveFailed) toast.warning('Theme equipped, but it could not be added to Saved.');
      else toast.success('Equipped ✨');
    },
    onError: (e: unknown, { account }) => {
      if (!isCurrent(account) || e instanceof ThemeAccountChangedError) return;
      console.error('Equip failed', e);
      toast.error('Could not equip theme');
    },
  });
  // Capture the actor synchronously when clicked, before React Query awaits any
  // lifecycle callbacks. A switch away and back still invalidates that actor.
  return {
    ...mutation,
    mutate: (input: EquipThemeInput) => mutation.mutate({ input, account: accountRef.current }),
    mutateAsync: (input: EquipThemeInput) => mutation.mutateAsync({ input, account: accountRef.current }),
  };
}

// Rule-gated detail lookup: public and owned private themes only.
export function useSharedThemeById(id: string | null | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['shared-theme', user?.id, id],
    queryFn: ({ signal }) => loadSharedTheme(id!, { signal }),
    enabled: !!user?.id && !!id,
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

      const { data, error } = await db
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

      const { error } = await db
        .from('saved_themes')
        .insert({
          user_id: profile.id, // Use profile ID
          shared_theme_id: sharedThemeId,
        });

      if (error) throw error;

      // Increment download count
      await db.rpc('increment_theme_downloads', { theme_id: sharedThemeId });
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

      const { error } = await db
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

      const { error } = await db
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

      const { error } = await db
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

      const { data, error } = await db
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
      const { error } = await db
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

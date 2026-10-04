import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import type { ThemeTokens } from './useCustomTheme';
import { useEffect, useRef, useState } from 'react';
import { useThemeActor } from '@/hooks/useThemeActor';
import { createAndDeliverTheme, changeThemeCollection, type ShareThemeInput } from '@/lib/themeSharingService';
import type { ThemeActor } from '@/lib/themeAuthorityClient';
import { firebaseAuth } from '@/lib/firebase/authService';
import { hasSavedTheme, loadOwnSharedThemes, loadSavedThemes, loadSharedTheme, loadPublicSharedThemes } from '@/lib/sharedThemeRepository';
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

// Theme payloads are session-bound and never reused after a failed admission.
const themeQueryOptions = { staleTime: 0, gcTime: 0, retry: false, refetchOnWindowFocus: true, refetchInterval: 30_000 } as const;

export function usePublicThemes(searchQuery?: string) {
  const session = useThemeActor();
  const [search, setSearch] = useState(searchQuery || '');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchQuery || ''), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  const query = useQuery({
    queryKey: ['public-themes', ...session.key, search],
    queryFn: async ({ signal }) => {
      const { actor, guard } = session.capture(); guard();
      const result = await loadPublicSharedThemes(actor, search, signal); guard(); return result;
    },
    enabled: !!session.actor, ...themeQueryOptions,
  });
  return { ...query, data: query.isError || query.isFetching ? undefined : query.data };
}

export function useSavedThemes() {
  const session = useThemeActor();
  const query = useQuery({
    queryKey: ['saved-themes', ...session.key],
    queryFn: async ({ signal }) => {
      const { actor, guard } = session.capture();
      const result = await loadSavedThemes(actor.profileId, { signal, actor }); guard(); return result;
    },
    enabled: !!session.actor, networkMode: 'always', ...themeQueryOptions,
  });
  return { ...query, data: query.isError || query.isFetching ? undefined : query.data };
}

export function useMySharedThemes() {
  const session = useThemeActor();
  const query = useQuery({
    queryKey: ['my-shared-themes', ...session.key],
    queryFn: async ({ signal }) => {
      const { actor, guard } = session.capture();
      const result = await loadOwnSharedThemes(actor.profileId, { signal, actor }); guard(); return result;
    },
    enabled: !!session.actor, networkMode: 'always', ...themeQueryOptions,
  });
  return { ...query, data: query.isError || query.isFetching ? undefined : query.data };
}

export type ThemeShareVisibility = 'public' | 'unlisted' | 'friends' | 'private';
export function useShareTheme() {
  const session = useThemeActor();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ input, captured }: { input: ShareThemeInput; captured: ReturnType<typeof session.capture> }) => {
      captured.guard();
      return createAndDeliverTheme(captured.actor, input, captured.guard);
    },
    onSuccess: ({ visibility }, { captured }) => {
      try { captured.guard(); } catch { return; }
      for (const key of ['public-themes', 'my-shared-themes', 'saved-themes']) void queryClient.invalidateQueries({ queryKey: [key] });
      const messages: Record<ThemeShareVisibility, string> = {
        public: 'Theme shared with the community', unlisted: 'Your share link is ready',
        friends: 'Theme delivered to your friends', private: 'Snapshot saved to your gallery',
      };
      toast.success(messages[visibility]);
    },
    onError: (error, { captured }) => {
      try { captured.guard(); } catch { return; }
      toast.error(error instanceof Error ? error.message : 'Could not share this theme. Please retry.');
    },
  });
  return { ...mutation,
    mutate: (input: ShareThemeInput, options?: { onSuccess?: (result: Awaited<ReturnType<typeof createAndDeliverTheme>>) => void }) => {
      const captured = session.capture();
      mutation.mutate({ input, captured }, { onSuccess: result => {
        try { captured.guard(); } catch { return; }
        options?.onSuccess?.(result);
      } });
    },
    mutateAsync: async (input: ShareThemeInput) => mutation.mutateAsync({ input, captured: session.capture() }),
  };
}

class ThemeAccountChangedError extends Error {
  constructor() { super('Your account changed. Please select the theme again.'); }
}

type EquipThemeInput = Pick<SharedTheme, 'id' | 'theme_tokens' | 'theme_name'>;
type ThemeAccount = { userId: string | undefined; profileId: string | undefined; actor: ThemeActor | null; guard?: () => void };

// Persist first; a failed write must not paint or claim an equipped account theme.
export function useEquipSharedTheme() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const { setTheme } = useTheme();
  const session = useThemeActor();
  const accountRef = useRef<ThemeAccount>({ userId: user?.id, profileId: profile?.id, actor: session.actor });
  if (accountRef.current.userId !== user?.id || accountRef.current.profileId !== profile?.id || accountRef.current.actor !== session.actor) {
    accountRef.current = { userId: user?.id, profileId: profile?.id, actor: session.actor };
  }
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const isCurrent = (account: ThemeAccount) => mountedRef.current && accountRef.current === account;
  const assertCurrent = async (account: ThemeAccount) => {
    if (!isCurrent(account) || !account.actor) throw new ThemeAccountChangedError();
    account.guard?.();
    const { data: { user: liveUser } } = await firebaseAuth.getUser();
    account.guard?.();
    if (!isCurrent(account) || liveUser?.id !== account.userId) throw new ThemeAccountChangedError();
  };

  const mutation = useMutation({
    mutationFn: async ({ input, account }: { input: EquipThemeInput; account: ThemeAccount }) => {
      if (!account.userId) throw new Error('Not authenticated');
      await assertCurrent(account);
      // Recheck visibility against the server; stale gallery/detail cache is not authority.
      const theme = await loadSharedTheme(input.id, { actor: account.actor! });
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
          if (!alreadySaved) await changeThemeCollection(account.actor!, 'save', theme.id);
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
      try { account.guard?.(); } catch { return; }
      queryClient.invalidateQueries({ queryKey: ['saved-themes'] });
      if (saveFailed) toast.warning('Theme equipped, but it could not be added to Saved.');
      else toast.success('Equipped ✨');
    },
    onError: (e: unknown, { account }) => {
      if (!isCurrent(account) || e instanceof ThemeAccountChangedError) return;
      try { account.guard?.(); } catch { return; }
      console.error('Equip failed', e);
      toast.error('Could not equip theme');
    },
  });
  // Capture the actor synchronously when clicked, before React Query awaits any
  // lifecycle callbacks. A switch away and back still invalidates that actor.
  const captureAccount = () => {
    const captured = session.capture();
    const account = { userId: captured.actor.uid, profileId: captured.actor.profileId, actor: captured.actor, guard: captured.guard };
    accountRef.current = account;
    return account;
  };
  return {
    ...mutation,
    mutate: (input: EquipThemeInput) => mutation.mutate({ input, account: captureAccount() }),
    mutateAsync: async (input: EquipThemeInput) => mutation.mutateAsync({ input, account: captureAccount() }),
  };
}

export function useSharedThemeById(id: string | null | undefined) {
  const session = useThemeActor();
  const query = useQuery({
    queryKey: ['shared-theme', ...session.key, id],
    queryFn: async ({ signal }) => {
      const { actor, guard } = session.capture();
      const result = await loadSharedTheme(id!, { signal, actor }); guard(); return result;
    },
    enabled: !!session.actor && !!id, ...themeQueryOptions,
  });
  return { ...query, data: query.isError || query.isFetching ? undefined : query.data };
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

function useThemeCollectionAction(action: 'save' | 'unsave' | 'like' | 'unlike') {
  const session = useThemeActor();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async ({ id, captured }: { id: string; captured: ReturnType<typeof session.capture> }) => {
      captured.guard(); await changeThemeCollection(captured.actor, action, id); captured.guard();
    },
    onSuccess: (_, { captured }) => {
      try { captured.guard(); } catch { return; }
      for (const key of ['saved-themes', 'public-themes', 'theme-likes', 'shared-theme']) void queryClient.invalidateQueries({ queryKey: [key] });
      if (action === 'save') toast.success('Theme saved to your collection');
      if (action === 'unsave') toast.success('Theme removed from your collection');
    },
    onError: (error, { captured }) => {
      try { captured.guard(); } catch { return; }
      toast.error(error instanceof Error ? error.message : 'Could not update your theme collection. Please retry.');
    },
  });
  return { ...mutation,
    mutate: (id: string) => mutation.mutate({ id, captured: session.capture() }),
    mutateAsync: async (id: string) => mutation.mutateAsync({ id, captured: session.capture() }),
  };
}
export function useSaveSharedTheme() { return useThemeCollectionAction('save'); }
export function useUnsaveTheme() { return useThemeCollectionAction('unsave'); }
export function useLikeTheme() { return useThemeCollectionAction('like'); }
export function useUnlikeTheme() { return useThemeCollectionAction('unlike'); }

// Check if user has liked themes
export function useUserThemeLikes() {
  const session = useThemeActor();
  const query = useQuery({
    queryKey: ['theme-likes', ...session.key],
    queryFn: async () => {
      const { actor, guard } = session.capture();
      const { data, error } = await db.from('theme_likes').select('shared_theme_id').eq('user_id', actor.profileId);
      guard(); if (error) throw error;
      return data.map(row => row.shared_theme_id);
    },
    enabled: !!session.actor, networkMode: 'always', ...themeQueryOptions,
  });
  return { ...query, data: query.isError || query.isFetching ? undefined : query.data };
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

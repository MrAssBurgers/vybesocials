import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useCallback } from 'react';

/**
 * Canonical shape of user preferences persisted to DB.
 * localStorage is used ONLY as a fast cache; DB is the source of truth.
 */
export interface UserPreferences {
  clips_muted: boolean;
  explore_view_mode: 'clips' | 'videos';
  button_sound: string;
  dismissed_quick_add_ids: string[];
  unlocked_easter_eggs: string[];
  intro_completed: boolean;
  referral_confirmed: boolean;
  extra: Record<string, unknown>;
}

const DEFAULTS: UserPreferences = {
  clips_muted: true,
  explore_view_mode: 'clips',
  button_sound: 'pop',
  dismissed_quick_add_ids: [],
  unlocked_easter_eggs: [],
  intro_completed: false,
  referral_confirmed: false,
  extra: {},
};

const CACHE_KEY = 'vybe_user_prefs_cache';

function getCached(): Partial<UserPreferences> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCache(prefs: UserPreferences) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(prefs));
  } catch { /* noop */ }
}

/** Read user preferences (DB-backed, localStorage cached). */
export function useUserPreferences() {
  const { user } = useAuth();
  const userId = user?.id;

  return useQuery({
    queryKey: ['user-preferences', userId],
    queryFn: async (): Promise<UserPreferences> => {
      const cached = getCached();

      if (!userId) return { ...DEFAULTS, ...cached };

      const { data, error } = await supabase
        .from('user_preferences' as any)
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !data) return { ...DEFAULTS, ...cached };

      const prefs: UserPreferences = {
        clips_muted: (data as any).clips_muted ?? DEFAULTS.clips_muted,
        explore_view_mode: (data as any).explore_view_mode ?? DEFAULTS.explore_view_mode,
        button_sound: (data as any).button_sound ?? DEFAULTS.button_sound,
        dismissed_quick_add_ids: (data as any).dismissed_quick_add_ids ?? DEFAULTS.dismissed_quick_add_ids,
        unlocked_easter_eggs: (data as any).unlocked_easter_eggs ?? DEFAULTS.unlocked_easter_eggs,
        intro_completed: (data as any).intro_completed ?? DEFAULTS.intro_completed,
        referral_confirmed: (data as any).referral_confirmed ?? DEFAULTS.referral_confirmed,
        extra: (data as any).extra ?? DEFAULTS.extra,
      };

      setCache(prefs);
      return prefs;
    },
    staleTime: 60_000,
    enabled: !!userId,
  });
}

/** Patch one or more preferences. Optimistic update + DB upsert. */
export function useUpdatePreferences() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Partial<UserPreferences>) => {
      const userId = user?.id;
      if (!userId) throw new Error('Not authenticated');

      const current = (qc.getQueryData(['user-preferences', userId]) as UserPreferences) ?? { ...DEFAULTS };
      const merged = { ...current, ...patch };

      const { error } = await supabase
        .from('user_preferences' as any)
        .upsert({
          user_id: userId,
          ...merged,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'user_id' });

      if (error) throw error;

      setCache(merged);
      return merged;
    },
    onMutate: async (patch) => {
      const userId = user?.id;
      const key = ['user-preferences', userId];
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData(key) as UserPreferences | undefined;
      qc.setQueryData(key, { ...DEFAULTS, ...prev, ...patch });
      return { prev };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(['user-preferences', user?.id], ctx.prev);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['user-preferences', user?.id] });
    },
  });
}

/**
 * Convenience: read a single preference with a setter.
 * The setter is fire-and-forget (optimistic).
 */
export function usePref<K extends keyof UserPreferences>(key: K) {
  const { data } = useUserPreferences();
  const { mutate } = useUpdatePreferences();
  const value = data?.[key] ?? DEFAULTS[key];

  const setValue = useCallback(
    (next: UserPreferences[K]) => mutate({ [key]: next } as Partial<UserPreferences>),
    [key, mutate],
  );

  return [value, setValue] as const;
}

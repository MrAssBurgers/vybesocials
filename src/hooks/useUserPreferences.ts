import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { useCallback } from 'react';
import { useReportAccountSession } from './useReportAccountSession';
import { reportAccountSnapshot } from '@/lib/reportModerationService';

/**
 * Canonical shape of user preferences persisted to DB.
 * localStorage is used ONLY as a fast cache; DB is the source of truth.
 */
export interface UserPreferences {
  /** Imported preference rows can have a document ID different from the profile. */
  id?: string;
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

const cacheKey = (uid: string, profileId: string) => `vybe_user_prefs_cache:${uid}:${profileId}`;

function getCached(key: string): Partial<UserPreferences> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setCache(key: string, prefs: UserPreferences) {
  try {
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch { /* noop */ }
}

/** Read user preferences (DB-backed, localStorage cached). */
export function useUserPreferences() {
  const { user } = useAuth();
  const profileId = useAuthProfileId();
  const session = useReportAccountSession();
  const userId = session.uid === user?.id ? profileId : undefined;

  return useQuery({
    queryKey: ['user-preferences', session.uid, userId, session.epoch],
    queryFn: async (): Promise<UserPreferences> => {
      if (!userId || !session.uid) throw new Error('Account is still loading');

      const { data, error } = await db
        .from('user_preferences' as any)
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (reportAccountSnapshot() !== session) throw new Error('Account changed');
      if (error) throw new Error(error.message);
      if (!data) { setCache(cacheKey(session.uid, userId), DEFAULTS); return DEFAULTS; }

      // Pick canonical fields while retaining the existing document identity.
      const prefs = Object.fromEntries(Object.entries(DEFAULTS).map(([key, fallback]) =>
        [key, (data as Record<string, unknown>)[key] ?? fallback],
      )) as UserPreferences;
      if (typeof (data as any).id === 'string') prefs.id = (data as any).id;

      setCache(cacheKey(session.uid, userId), prefs);
      return prefs;
    },
    staleTime: 60_000,
    enabled: !!userId,
    placeholderData: userId && session.uid ? () => {
      const cached = getCached(cacheKey(session.uid!, userId));
      return cached ? { ...DEFAULTS, ...cached } : undefined;
    } : undefined,
  });
}

/** Patch one or more preferences. Optimistic update + DB upsert. */
export function useUpdatePreferences() {
  const { user } = useAuth();
  const profileId = useAuthProfileId();
  const qc = useQueryClient();
  const session = useReportAccountSession();
  const userId = session.uid === user?.id ? profileId : undefined;
  const key = ['user-preferences', session.uid, userId, session.epoch];
  const assertCurrent = () => {
    if (!userId || !session.uid || reportAccountSnapshot() !== session) throw new Error('Account changed');
  };

  return useMutation({
    scope: { id: `preferences:${session.uid}:${userId}` },
    mutationFn: async (input: Partial<UserPreferences> | ((current: UserPreferences) => Partial<UserPreferences>)) => {
      assertCurrent();

      const current = (qc.getQueryData(key) as UserPreferences) ?? DEFAULTS;
      const patch = typeof input === 'function' ? input(current) : input;
      const merged = { ...current, ...patch, extra: { ...current.extra, ...patch.extra } };

      const { error } = await db
        .from('user_preferences' as any)
        .upsert({
          ...(current.id ? { id: current.id } : {}),
          user_id: userId,
          ...patch,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'user_id' });

      if (error) throw new Error(error.message);
      assertCurrent();
      setCache(cacheKey(session.uid!, userId!), merged);
      qc.setQueryData(key, merged);
      return merged;
    },
    onMutate: async (patch) => {
      assertCurrent();
      await qc.cancelQueries({ queryKey: key });
      assertCurrent();
      const prev = qc.getQueryData(key) as UserPreferences | undefined;
      if (typeof patch !== 'function') qc.setQueryData(key, { ...DEFAULTS, ...prev, ...patch, extra: { ...prev?.extra, ...patch.extra } });
      return { prev, key };
    },
    onError: (_err, _patch, ctx) => {
      if (!ctx || reportAccountSnapshot() !== session) return;
      if (ctx.prev) qc.setQueryData(ctx.key, ctx.prev);
      else qc.removeQueries({ queryKey: ctx.key, exact: true });
    },
    onSettled: () => {
      if (reportAccountSnapshot() === session) qc.invalidateQueries({ queryKey: key });
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

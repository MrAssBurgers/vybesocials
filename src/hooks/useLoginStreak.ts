import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useProfileAccount } from './useProfileAccount';
import { toast } from 'sonner';
import { haptics } from '@/lib/haptics';

const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
interface StreakResult {
  success: boolean; streak: number; longest_streak: number; is_new_day?: boolean;
  streak_extended?: boolean; hours_remaining?: number | null; needs_login_today?: boolean;
  expires_at?: string; error?: string;
}
function checkedStreak(data: unknown): StreakResult {
  const row = data as StreakResult | null;
  if (!row || row.success !== true || !Number.isSafeInteger(row.streak) || row.streak < 0 || !Number.isSafeInteger(row.longest_streak) || row.longest_streak < 0) throw new Error('Your streak could not be confirmed.');
  return row;
}
function useStreakStatus() {
  const account = useProfileAccount();
  const key = ['login-streak', account.user?.id, account.profile?.id, account.session.epoch] as const;
  const query = useQuery({
    queryKey: key, enabled: account.ready, placeholderData: undefined,
    queryFn: async ({ signal }) => {
      account.guard();
      if (signal.aborted) throw new Error('Streak view closed.');
      const { data, error } = await db.rpc('get_login_streak_status', { p_timezone: clientTimezone });
      account.guard();
      if (signal.aborted) throw new Error('Streak view closed.');
      if (error) throw error;
      return checkedStreak(data);
    },
    staleTime: 5 * 60_000, gcTime: 0, refetchOnMount: 'always', retry: false,
  });
  return { account, key, ...query, data: account.ready && !query.isError && !query.isPlaceholderData && query.isFetchedAfterMount ? query.data : undefined };
}

/** Every popup and late effect belongs to the account and mounted controller that requested it. */
export function useLoginStreak() {
  const queryClient = useQueryClient();
  const status = useStreakStatus();
  const { account } = status;
  const scope = JSON.stringify(status.key);
  const [popup, setPopup] = useState<{ scope: string; data: StreakResult } | null>(null);
  const mounted = useRef(true);
  const lifetime = useRef(0);
  const capture = () => {
    const generation = lifetime.current;
    const guard = () => {
      account.guard();
      if (!mounted.current || lifetime.current !== generation) throw new Error('Streak view closed.');
    };
    guard(); return guard;
  };
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; lifetime.current += 1; };
  }, []);
  const update = useMutation({
    mutationFn: async ({ guard }: { guard: () => void; scope: string }) => {
      guard();
      const { data, error } = await db.rpc('update_login_streak', { p_timezone: clientTimezone });
      guard();
      if (error) throw error;
      return checkedStreak(data);
    },
    onSuccess: (data, operation) => {
      try { operation.guard(); } catch { return; }
      void queryClient.invalidateQueries({ queryKey: status.key });
      if (data.is_new_day && data.streak_extended && data.streak >= 1) {
        setPopup({ scope: operation.scope, data });
        haptics.success();
      }
    },
  });
  useEffect(() => {
    if (!account.ready) return;
    const guard = capture();
    update.mutate({ guard, scope });
    // One tracking attempt per account/controller; the RPC deduplicates the day.
  }, [scope, account.ready]);
  const restore = useMutation({
    mutationFn: async ({ guard }: { guard: () => void }) => {
      guard();
      const { data, error } = await db.rpc('restore_login_streak', { p_timezone: clientTimezone });
      guard();
      if (error) throw error;
      const result = data as { success?: boolean; streak?: number };
      if (result?.success !== true || !Number.isSafeInteger(result.streak) || result.streak! < 0) throw new Error('Could not restore streak.');
      return result.streak!;
    },
    onSuccess: (count, operation) => {
      try { operation.guard(); } catch { return; }
      void queryClient.invalidateQueries({ queryKey: status.key });
      toast.success(`Streak restored to ${count} days!`); haptics.success();
    },
    onError: (_error, operation) => {
      try { operation.guard(); } catch { return; }
      toast.error('Failed to restore streak');
    },
  });
  const dismissStreakPopup = useCallback(() => setPopup(null), []);
  const currentPopup = account.ready && popup?.scope === scope ? popup.data : null;
  return {
    streak: status.data?.streak ?? 0, longestStreak: status.data?.longest_streak ?? 0,
    hoursRemaining: status.data?.hours_remaining ?? null, needsLoginToday: status.data?.needs_login_today ?? true,
    isLoading: status.isLoading, showStreakPopup: !!currentPopup, streakData: currentPopup, dismissStreakPopup,
    restoreStreak: () => { try { restore.mutate({ guard: capture() }); } catch { /* Retired controller. */ } },
    isRestoring: restore.isPending,
  };
}
export function useStreakCount() { return useStreakStatus().data?.streak ?? 0; }

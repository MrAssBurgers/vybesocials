import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProfileAccount } from './useProfileAccount';
import { haptics } from '@/lib/haptics';
import type { LoginStreakReceipt, StreakAction } from '@/lib/loginStreakService';

/** Keep the checked transport out of the application boot bundle. */
async function request(account: ReturnType<typeof useProfileAccount>, action: StreakAction, guard: () => void, expectedRevision?: string) {
  guard();
  const { manageLoginStreak } = await import('@/lib/loginStreakService');
  guard();
  return manageLoginStreak({ uid: account.user!.id, profileId: account.profile!.id }, action, { expectedRevision }, guard);
}
export function useLoginStreakStatus() {
  const account = useProfileAccount();
  const key = ['login-streak', account.user?.id, account.profile?.id, account.session.epoch] as const;
  const query = useQuery({
    queryKey: key, enabled: account.ready, placeholderData: undefined,
    queryFn: async ({ signal }) => {
      const guard = () => { account.guard(); if (signal.aborted) throw new Error('Streak view closed.'); };
      const result = await request(account, 'read', guard); guard(); return result;
    },
    staleTime: 60_000, gcTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: 'always', retry: false,
  });
  return { ...query, account, key, data: account.ready && !query.isError && !query.isPlaceholderData && query.isFetchedAfterMount ? query.data : undefined };
}

/** Every popup and late effect belongs to the account and mounted controller that requested it. */
export function useLoginStreak() {
  const queryClient = useQueryClient();
  const status = useLoginStreakStatus();
  const { account } = status;
  const scope = JSON.stringify(status.key);
  const [popup, setPopup] = useState<{ scope: string; data: LoginStreakReceipt | null; error?: string } | null>(null);
  const mounted = useRef(true), lifetime = useRef(0);
  const presentation = useRef(0), pending = useRef<symbol | null>(null);
  const calendar = useRef<{ scope: string; initialized: boolean; day?: string }>({ scope, initialized: false });
  if (calendar.current.scope !== scope) { calendar.current = { scope, initialized: false }; pending.current = null; }
  const capture = () => {
    const generation = lifetime.current, view = presentation.current;
    const guard = () => { account.guard(); if (!mounted.current || lifetime.current !== generation || presentation.current !== view) throw new Error('Streak view closed.'); };
    guard(); return guard;
  };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; lifetime.current += 1; pending.current = null; calendar.current.initialized = false; calendar.current.day = undefined; }; }, []);
  const refresh = () => { void queryClient.invalidateQueries({ queryKey: status.key }); };
  const update = useMutation({
    mutationFn: ({ guard }: { guard: () => void; scope: string; token: symbol }) => request(account, 'track', guard),
    onSuccess: (data, operation) => {
      try { operation.guard(); } catch { return; }
      refresh();
      if (data.isNewDay || data.restore.eligible) {
        setPopup({ scope: operation.scope, data });
        if (!data.streakBroken) haptics.success();
      } else setPopup(previous => previous?.scope === operation.scope ? null : previous);
    },
    onError: (_error, operation) => {
      try { operation.guard(); } catch { return; }
      setPopup({ scope: operation.scope, data: null, error: 'Your login streak could not be confirmed. Retry to check today’s login.' });
    },
    onSettled: (_data, _error, operation) => { if (pending.current === operation.token) pending.current = null; },
  });
  function track() {
    if (pending.current) return;
    try { const guard = capture(), token = Symbol(); pending.current = token; update.mutate({ guard, scope, token }); } catch { /* Retired controller. */ }
  }
  function trackVisibleDay() {
    if (!account.ready || document.visibilityState === 'hidden' || pending.current) return;
    const observed = calendar.current;
    if (!observed.initialized) {
      observed.initialized = true; observed.day = status.data?.currentDay; track(); return;
    }
    if (!status.data) return;
    // One automatic attempt per server-observed day, including after a failed request.
    if (!observed.day) { observed.day = status.data.currentDay; return; }
    if (status.data.needsLoginToday && observed.day !== status.data.currentDay) {
      observed.day = status.data.currentDay; track();
    }
  }
  useEffect(() => {
    trackVisibleDay();
  }, [scope, account.ready, status.data?.currentDay, status.data?.needsLoginToday, update.isPending]);
  useEffect(() => {
    if (!account.ready) return;
    const refreshVisible = () => {
      if (document.visibilityState === 'hidden') return;
      try { account.guard(); void status.refetch(); } catch { /* Retired account. */ }
    };
    const timer = setInterval(refreshVisible, 60_000);
    document.addEventListener('visibilitychange', refreshVisible);
    window.addEventListener('focus', refreshVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refreshVisible); window.removeEventListener('focus', refreshVisible); };
  }, [scope, account.ready]);
  const restore = useMutation({
    mutationFn: ({ guard, revision }: { guard: () => void; revision: string; scope: string; token: symbol }) => request(account, 'restore', guard, revision),
    onSuccess: (data, operation) => {
      try { operation.guard(); } catch { return; }
      setPopup({ scope: operation.scope, data }); refresh(); haptics.success();
    },
    onError: (_error, operation) => {
      try { operation.guard(); } catch { return; }
      setPopup(previous => previous?.scope === operation.scope ? { ...previous, error: 'Your restore could not be confirmed. Retry, or refresh the streak to check whether it is still available.' } : previous);
    },
    onSettled: (_data, _error, operation) => { if (pending.current === operation.token) pending.current = null; },
  });
  const dismissStreakPopup = useCallback(() => { presentation.current += 1; setPopup(null); }, []);
  const currentPopup = account.ready && popup?.scope === scope ? popup : null;
  const current = currentPopup?.data ?? status.data;
  return {
    streak: status.data?.streak ?? 0, longestStreak: status.data?.longestStreak ?? 0,
    hoursRemaining: status.data?.expiresAt ? Math.max(0, (Date.parse(status.data.expiresAt) - Date.now()) / 3_600_000) : null,
    needsLoginToday: status.data?.needsLoginToday ?? true,
    isLoading: status.isLoading, isError: status.isError, showStreakPopup: !!currentPopup,
    streakData: currentPopup?.data ? { ...currentPopup.data, longest_streak: currentPopup.data.longestStreak, is_new_day: currentPopup.data.isNewDay, streak_extended: currentPopup.data.streakExtended } : null,
    popupError: currentPopup?.error, dismissStreakPopup,
    retryStreak: track,
    restoreStreak: () => {
      try { if (!pending.current && current?.restore.eligible && current.revision) { const guard = capture(), token = Symbol(); pending.current = token; restore.mutate({ guard, revision: current.revision, scope, token }); } } catch { /* Retired controller. */ }
    },
    isRestoring: restore.isPending && restore.variables?.scope === scope,
    isUpdating: update.isPending && update.variables?.scope === scope,
  };
}
export function useStreakCount() { return useLoginStreakStatus().data?.streak ?? 0; }

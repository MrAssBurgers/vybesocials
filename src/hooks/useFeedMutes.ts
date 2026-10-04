import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { feedMuteAccountGuard, listFeedMutes, mutedAuthorIds, removeFeedMute, saveFeedMute, type FeedMute } from '@/lib/feedMuteService';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';

export function useFeedMutes(enabled = true) {
  const { user } = useAuth(); const session = useReportAccountSession();
  const uid = user?.id; const current = uid === session.uid;
  const key = ['feed-mutes', uid, session.epoch, 'list'] as const;
  const guard = useMemo(() => feedMuteAccountGuard(uid || ''), [uid, session.epoch]);
  const query = useQuery({ queryKey: key, queryFn: () => listFeedMutes(guard), enabled: enabled && !!uid && current,
    gcTime: 0, staleTime: 60_000, retry: false, refetchOnWindowFocus: true, refetchOnReconnect: true, refetchInterval: enabled && uid ? 60_000 : false });
  const signedOut = !uid && !session.uid;
  const rows = signedOut ? [] : current ? query.data : undefined;
  const aliases = useMemo(() => mutedAuthorIds(rows || []), [rows]);
  const needsRepair = !!rows?.some(row => row.needsRepair);
  const repairError = useMemo(() => needsRepair ? new Error('A saved feed mute needs removal in Settings → Privacy → Muted in feeds.') : null, [needsRepair]);
  return { ...query, rows, aliases, needsRepair, isError: query.isError || needsRepair, error: repairError || query.error,
    ready: signedOut || (current && rows !== undefined && !needsRepair), key, guard, sessionKey: `${uid || 'signed-out'}:${session.epoch}` };
}

export function useFeedMuteActions(targetKey = '') {
  const mutes = useFeedMutes(); const client = useQueryClient();
  const lifetime = useRef({ mounted: true });
  useEffect(() => { const active = lifetime.current; active.mounted = true; return () => { active.mounted = false; }; }, []);
  const key = `${mutes.sessionKey}:${targetKey}`; const currentKey = useRef(key); currentKey.current = key;
  const assertCurrent = useCallback(() => {
    mutes.guard();
    if (!lifetime.current.mounted || currentKey.current !== key) throw Object.assign(new Error('This mute action is no longer open.'), { code: 'account-changed' });
  }, [mutes.guard, key]);
  const isCurrent = useCallback(() => { try { assertCurrent(); return true; } catch { return false; } }, [assertCurrent]);
  const apply = async (target: string, muted: boolean, guard = assertCurrent) => {
    guard();
    const saved = muted ? await saveFeedMute(target, guard) : (await removeFeedMute(target, guard), null);
    guard();
    await client.cancelQueries({ queryKey: mutes.key });
    guard();
    client.setQueryData<FeedMute[]>(mutes.key, previous => previous === undefined ? undefined : muted
      ? [...previous.filter(row => row.profileId !== saved!.profileId), saved!]
      : previous.filter(row => row.profileId !== target));
    void client.invalidateQueries({ queryKey: mutes.key });
    return saved;
  };
  return { ...mutes, mute: (target: string) => apply(target, true), unmute: (profileId: string) => apply(profileId, false),
    // Undo remains available after its originating menu closes, but never
    // crosses accounts or logout/login epochs.
    undo: (profileId: string) => apply(profileId, false, mutes.guard), assertCurrent, isCurrent };
}

import { useEffect, useMemo, useReducer } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useProfileAccount } from './useProfileAccount';
import { reportAccountSnapshot } from '@/lib/reportModerationService';
import { notificationPreferenceAttempt, notificationPreferenceRequest, type NotificationBooleanKey, type NotificationPreferenceState } from '@/lib/notificationPreferenceService';
export type { NotificationPreferences } from '@/lib/notificationPreferenceService';

function usePreferenceActor() {
  const account = useProfileAccount();
  return { uid: account.user?.id || '', profileId: account.profile?.id || '', epoch: account.session.epoch, ready: account.ready, guard: account.guard };
}
const queryKey = (actor: ReturnType<typeof usePreferenceActor>) => ['notification-preferences', 'checked-v1', actor.uid, actor.profileId, actor.epoch] as const;
export function useNotificationPreferences() {
  const actor = usePreferenceActor();
  const query = useQuery({
    queryKey: queryKey(actor),
    queryFn: () => notificationPreferenceRequest(actor, { action: 'read' }, actor.guard),
    enabled: actor.ready, staleTime: 0, gcTime: 0, retry: false, refetchOnMount: 'always', refetchOnWindowFocus: true, placeholderData: undefined,
  });
  const current = actor.ready && reportAccountSnapshot().epoch === actor.epoch && query.isSuccess && !query.isFetching && !query.isPlaceholderData;
  return { ...query, data: current ? query.data.preferences : undefined, revision: current ? query.data.revision : undefined };
}
export function useUpdateNotificationPreference() {
  const actor = usePreferenceActor(), client = useQueryClient();
  const [, refreshPending] = useReducer((value: number) => value + 1, 0);
  const context = useMemo(() => ({ active: true, pending: false }), [actor.uid, actor.profileId, actor.epoch]);
  useEffect(() => { context.active = true; return () => { context.active = false; }; }, [context]);
  const mutation = useMutation({
    mutationFn: async ({ key, value, revision }: { key: NotificationBooleanKey; value: boolean; revision: string }) => {
      const guard = () => { actor.guard(); if (!context.active) throw new Error('Reopen notification settings before saving.'); };
      guard();
      if (context.pending) throw new Error('A notification setting is still saving.');
      context.pending = true;
      refreshPending();
      try {
        const attempt = notificationPreferenceAttempt(actor, key, value, revision);
        const state = await notificationPreferenceRequest(actor, { action: 'set', key, value, revision, requestId: attempt.requestId }, guard);
        guard();
        // A read begun before this save can finish later with the old revision.
        // Retire that observer request before installing the checked receipt.
        await client.cancelQueries({ queryKey: queryKey(actor), exact: true });
        guard(); attempt.complete();
        client.setQueryData<NotificationPreferenceState>(queryKey(actor), state);
        return state;
      } finally { context.pending = false; if (context.active) refreshPending(); }
    },
  });
  return { ...mutation, isPending: context.pending };
}

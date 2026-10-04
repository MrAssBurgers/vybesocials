import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { useEffect } from 'react';
import { changeUserBackground, loadUserBackgrounds, type AddBackgroundInput, type BackgroundChange } from '@/lib/userBackgroundRepository';
import { BackgroundAccountChangedError, useBackgroundAccount } from './useBackgroundAccount';
export type { UserBackground } from '@/lib/userBackgroundRepository';

export function useUserBackgrounds() {
  const { user, profile } = useAuth();
  const account = { authUid: user?.id || '', profileId: profile?.id || '' };
  return useQuery({
    queryKey: ['user-backgrounds', account.authUid, account.profileId],
    queryFn: ({ signal }) => loadUserBackgrounds(account, signal),
    enabled: !!account.authUid && !!account.profileId,
    staleTime: 5 * 60 * 1000, gcTime: 30 * 60 * 1000,
    refetchOnMount: true, refetchOnWindowFocus: false,
  });
}

export function useActiveBackground() {
  return useUserBackgrounds().data?.find(bg => bg.is_active) || null;
}

export function usePrefetchBackgrounds() {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const authUid = user?.id;
  const profileId = profile?.id;
  useEffect(() => {
    if (!authUid || !profileId) return;
    void queryClient.prefetchQuery({
      queryKey: ['user-backgrounds', authUid, profileId],
      queryFn: ({ signal }) => loadUserBackgrounds({ authUid, profileId }, signal),
      staleTime: 5 * 60 * 1000,
    });
  }, [authUid, profileId, queryClient]);
}

function useBackgroundMutation<T>(toChange: (input: T) => BackgroundChange, success?: string) {
  const scope = useBackgroundAccount();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ input, actor }: { input: T; actor: typeof scope }) => changeUserBackground(actor.account, toChange(input), actor.assertCurrent),
    onSuccess: (result, { actor }) => {
      if (!actor.isCurrent()) return;
      void queryClient.invalidateQueries({ queryKey: ['user-backgrounds', actor.account.authUid, actor.account.profileId] });
      if (result.cleanupFailed) toast.warning('Background removed from your library, but its stored file could not be deleted.');
      else if (success) toast.success(success);
    },
    onError: (error, { actor }) => {
      if (!actor.isCurrent() || error instanceof BackgroundAccountChangedError) return;
      toast.error(error instanceof Error ? error.message : 'Could not save background changes');
    },
  });
  return {
    ...mutation,
    mutate: (input: T) => mutation.mutate({ input, actor: scope }),
    mutateAsync: (input: T) => mutation.mutateAsync({ input, actor: scope }),
  };
}

export function useAddBackground() { return useBackgroundMutation((input: AddBackgroundInput) => ({ kind: 'add', input })); }
export function useSetActiveBackground() { return useBackgroundMutation((id: string) => ({ kind: 'activate', id }), 'Background applied!'); }
export function useRenameBackground() { return useBackgroundMutation((input: { id: string; name: string }) => ({ kind: 'rename', ...input }), 'Background renamed!'); }
export function useDeleteBackground() { return useBackgroundMutation((input: { id: string; storagePath?: string | null }) => ({ kind: 'delete', id: input.id }), 'Background deleted!'); }
export function useClearActiveBackground() { return useBackgroundMutation((_input: void) => ({ kind: 'clear' })); }

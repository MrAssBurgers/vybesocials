import { useMutation, type MutateOptions, type UseMutationOptions, type UseMutationResult } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { ownedDmProfileId } from '@/lib/dmAccountScope';
import { reportAccountGuard, reportAccountSnapshot, type ReportAccountSession } from '@/lib/reportModerationService';
import { useReportAccountSession } from './useReportAccountSession';
import { useEffect } from 'react';
import { toast } from 'sonner';

export type DmActor = { uid: string; profileId: string; session: ReportAccountSession; guard: () => void };
export type DmOperation<T> = { value: T; original: unknown; actor: DmActor };

export { dmPrivateKey } from '@/lib/dmAccountScope';

export function useDmActorScope() {
  const { user, profile, authReady } = useAuth();
  const session = useReportAccountSession();
  const profileId = ownedDmProfileId(user?.id, profile);
  const ready = !!(authReady && user?.id && profileId && session.uid === user.id);
  const capture = (): DmActor => {
    if (!ready || !profileId || !user?.id) throw new Error('Refresh Messages before updating this chat.');
    const accountGuard = reportAccountGuard(user.id);
    const guard = () => {
      accountGuard();
      const current = reportAccountSnapshot();
      if (current.uid !== session.uid || current.epoch !== session.epoch) throw new Error('Your account session changed.');
      const currentProfileId = ownedDmProfileId(user.id);
      if (currentProfileId && currentProfileId !== profileId) throw new Error('Your profile binding changed.');
    };
    guard();
    return { uid: user.id, profileId, session, guard };
  };
  return { ready, profileId, session, capture };
}

/** Capture identity and intent at the public mutate call, before React Query's
 * asynchronous onMutate. Rerenders must not retarget a queued operation. */
export function useDmAccountMutation<TData, TVariables, TInput, TContext = unknown>(
  options: Omit<UseMutationOptions<TData, Error, DmOperation<TInput>, TContext>, 'mutationFn'> & {
    capture: (value: TVariables) => TInput;
    mutationFn: (operation: DmOperation<TInput>) => Promise<TData>;
  },
): UseMutationResult<TData, Error, TVariables, TContext> {
  const scope = useDmActorScope();
  const current = (operation: DmOperation<TInput>) => { try { operation.actor.guard(); return true; } catch { return false; } };
  const mutation = useMutation<TData, Error, DmOperation<TInput>, TContext>({
    ...options,
    mutationFn: operation => { operation.actor.guard(); return options.mutationFn(operation); },
    onMutate: (operation, context) => { operation.actor.guard(); return options.onMutate?.(operation, context); },
    onSuccess: (data, operation, result, context) => { if (current(operation)) return options.onSuccess?.(data, operation, result, context); },
    onError: (error, operation, result, context) => { if (current(operation)) return options.onError?.(error, operation, result, context); },
    onSettled: (data, error, operation, result, context) => { if (current(operation)) return options.onSettled?.(data, error, operation, result, context); },
  });
  const { reset } = mutation;
  useEffect(() => { reset(); }, [scope.session.uid, scope.session.epoch, scope.profileId, reset]);
  const start = (value: TVariables) => ({ actor: scope.capture(), value: options.capture(value), original: value });
  const callbacks = (call?: MutateOptions<TData, Error, TVariables, TContext>): MutateOptions<TData, Error, DmOperation<TInput>, TContext> | undefined => call && ({
    onSuccess: (data, operation, result, context) => { if (current(operation)) call.onSuccess?.(data, operation.original as TVariables, result, context); },
    onError: (error, operation, result, context) => { if (current(operation)) call.onError?.(error, operation.original as TVariables, result, context); },
    onSettled: (data, error, operation, result, context) => { if (current(operation)) call.onSettled?.(data, error, operation.original as TVariables, result, context); },
  });
  return {
    ...mutation,
    variables: mutation.variables?.original as TVariables,
    mutate: (value: TVariables, call?: MutateOptions<TData, Error, TVariables, TContext>) => {
      // A retained event handler from a retired account has no UI to notify.
      try { mutation.mutate(start(value), callbacks(call)); } catch {
        const account = reportAccountSnapshot();
        if (scope.ready && account.uid === scope.session.uid && account.epoch === scope.session.epoch) toast.error('Could not update this chat. Refresh Messages and try again.');
      }
    },
    mutateAsync: (value: TVariables, call?: MutateOptions<TData, Error, TVariables, TContext>) => mutation.mutateAsync(start(value), callbacks(call)),
  } as UseMutationResult<TData, Error, TVariables, TContext>;
}

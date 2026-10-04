import { useMutation, useQuery, useQueryClient, type MutateOptions } from '@tanstack/react-query';
import { useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { tokenAccountGuard, tokenAccountSnapshot, tokenMarketplaceRequest, type TokenAccountGuard, type TokenActionResult } from '@/lib/tokenMarketplaceService';

export function useTokenMarketplaceState(enabled = true) {
  const uid = useAuth().user?.id;
  const snapshot = tokenAccountSnapshot();
  const guard = tokenAccountGuard(uid);
  return useQuery({
    queryKey: ['token-marketplace', uid, snapshot.epoch],
    queryFn: ({ signal }) => tokenMarketplaceRequest({ action: 'state' }, () => { guard(); if (signal.aborted) throw new DOMException('Wallet request cancelled', 'AbortError'); }),
    enabled: enabled && !!uid, staleTime: 15_000, refetchInterval: 30_000, retry: false,
  });
}

export function useTokenAction<T>(run: (input: T, guard: TokenAccountGuard, uid: string) => Promise<TokenActionResult>, onSuccess?: (result: TokenActionResult, input: T) => void, onError?: (error: Error) => void) {
  const uid = useAuth().user?.id;
  const epoch = tokenAccountSnapshot().epoch;
  const lease = useMemo(() => tokenAccountGuard(uid), [uid, epoch]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const qc = useQueryClient();
  const guard = () => { if (!uid) throw Object.assign(new Error('Your account is still loading. Please try again.'), { code: 'account-changed' }); lease(); if (!mounted.current) throw Object.assign(new Error('This view changed. Please try again.'), { code: 'account-changed' }); };
  type Callbacks = MutateOptions<TokenActionResult, Error, T>;
  type Operation = { input: T; guard: TokenAccountGuard; uid: string; run: typeof run; success: typeof onSuccess; error: typeof onError; callbacks?: Callbacks };
  const mutation = useMutation({
    mutationFn: async (operation: Operation) => { operation.guard(); const result = await operation.run(operation.input, operation.guard, operation.uid); operation.guard(); return result; },
    onSuccess: async (result, operation) => {
      operation.guard();
      await qc.invalidateQueries({ queryKey: ['token-marketplace', operation.uid] });
      operation.guard();
      for (const key of ['locker-items', 'premium-locker-items', 'profile', 'profile-by-id', 'profile-by-username', 'display-style']) void qc.invalidateQueries({ queryKey: [key] });
      operation.success?.(result, operation.input);
      operation.guard(); operation.callbacks?.onSuccess?.(result, operation.input, undefined, { client: qc, meta: undefined, mutationKey: undefined });
    },
    onError: (error: Error, operation) => {
      try { operation.guard(); } catch { return; }
      operation.error?.(error);
      operation.callbacks?.onError?.(error, operation.input, undefined, { client: qc, meta: undefined, mutationKey: undefined });
    },
    onSettled: (data, error, operation) => {
      try { operation.guard(); } catch { return; }
      operation.callbacks?.onSettled?.(data, error, operation.input, undefined, { client: qc, meta: undefined, mutationKey: undefined });
    },
  });
  const operation = (input: T, callbacks?: Callbacks): Operation => ({ input, guard, uid: uid || '', run, success: onSuccess, error: onError, callbacks });
  return { ...mutation, mutate: (input: T, callbacks?: Callbacks) => mutation.mutate(operation(input, callbacks)), mutateAsync: (input: T, callbacks?: Callbacks) => mutation.mutateAsync(operation(input, callbacks)) };
}

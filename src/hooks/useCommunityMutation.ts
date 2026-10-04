import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useEffect, useRef } from 'react';
import { communityAccountLease, type CommunityAccountLease } from '@/lib/communityService';

type AccountContext = { guard: CommunityAccountLease };

/** Bind side effects, including success callbacks, to the account that started them. */
export function useCommunityMutation<TData, TVariables = void>(
  options: Omit<UseMutationOptions<TData, Error, TVariables, AccountContext>, 'onMutate'>,
) {
  const uid = useAuth().user?.id;
  const lease = communityAccountLease(uid);
  const operations = useRef(new WeakMap<object, { guard: CommunityAccountLease; run: typeof options.mutationFn }>());
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const guard = () => {
    lease();
    if (!mounted.current) throw Object.assign(new Error('Community view changed. Please try again.'), { code: 'account-changed' });
  };
  return useMutation<TData, Error, TVariables, AccountContext>({
    ...options,
    onMutate: (_variables, context) => {
      guard();
      operations.current.set(context, { guard, run: options.mutationFn });
      return { guard };
    },
    mutationFn: async (variables, context) => {
      const operation = operations.current.get(context);
      if (!operation?.run) throw new Error('Community action is unavailable');
      operation.guard();
      const result = await operation.run(variables, context);
      operation.guard();
      return result;
    },
    onSuccess: (data, variables, account, context) => {
      if (!account) throw new Error('Community account is unavailable');
      account.guard();
      return options.onSuccess?.(data, variables, account, context);
    },
    onError: (error, variables, account, context) => {
      try { if (!account) return; account.guard(); } catch { return; }
      return options.onError?.(error, variables, account, context);
    },
  });
}

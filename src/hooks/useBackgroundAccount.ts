import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { firebaseAuth } from '@/lib/firebase/authService';

export class BackgroundAccountChangedError extends Error {
  constructor() { super('Your account changed. Please try again.'); }
}

/** Capture the rendered account, including switches away and back to it. */
export function useBackgroundAccount() {
  const { user, profile } = useAuth();
  const ref = useRef({ authUid: user?.id || '', profileId: profile?.id || '' });
  if (ref.current.authUid !== (user?.id || '') || ref.current.profileId !== (profile?.id || '')) {
    ref.current = { authUid: user?.id || '', profileId: profile?.id || '' };
  }
  const account = ref.current;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const isCurrent = useCallback(() => mounted.current && ref.current === account, [account]);
  const assertCurrent = useCallback(async () => {
    if (!isCurrent()) throw new BackgroundAccountChangedError();
    const { data: { user: liveUser } } = await firebaseAuth.getUser();
    if (!isCurrent() || !account.authUid || !account.profileId || liveUser?.id !== account.authUid) throw new BackgroundAccountChangedError();
  }, [account, isCurrent]);
  return { account, isCurrent, assertCurrent };
}

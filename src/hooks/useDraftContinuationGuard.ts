import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { tokenAccountGuard } from '@/lib/tokenMarketplaceService';

/** Capture before asynchronous work; permit draft changes only while the same
 * account, mounted composer and draft scope still own its result. */
export function useDraftContinuationGuard(scope: string) {
  const { user, profile } = useAuth();
  const identity = JSON.stringify([scope, user?.id, profile?.id, profile?.user_id]);
  const current = useRef({ identity, revision: 0 });
  if (current.current.identity !== identity) current.current = { identity, revision: current.current.revision + 1 };
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  return () => {
    const guard = tokenAccountGuard(user?.id);
    const revision = current.current.revision;
    return () => {
      if (!mounted.current || current.current.revision !== revision || current.current.identity !== identity || !user || profile?.user_id !== user.id) return false;
      try { guard(); return true; } catch { return false; }
    };
  };
}

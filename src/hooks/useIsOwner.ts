import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { isCurrentUserOwner } from '@/lib/ownerBypass';

/**
 * Returns whether the currently authenticated user is the project owner.
 * `ready` is false until the check resolves (so we don't briefly flash
 * owner-only UI to non-owners on first paint).
 */
export function useIsOwner(): { isOwner: boolean; ready: boolean } {
  const { user } = useAuth();
  const [state, setState] = useState<{ isOwner: boolean; ready: boolean }>({
    isOwner: false,
    ready: false,
  });

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setState({ isOwner: false, ready: true });
      return;
    }
    isCurrentUserOwner().then((isOwner) => {
      if (!cancelled) setState({ isOwner, ready: true });
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return state;
}

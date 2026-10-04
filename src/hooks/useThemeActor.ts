import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/auth';
import { reportAccountSnapshot, reportAccountSubscribe } from '@/lib/reportModerationService';
import { themeActorGuard, type ThemeActor } from '@/lib/themeAuthorityClient';

export function useThemeActor() {
  const { user, profile } = useAuth();
  const session = useSyncExternalStore(reportAccountSubscribe, reportAccountSnapshot, reportAccountSnapshot);
  const valid = !!user?.id && !!profile?.id && session.uid === user.id && (!profile.user_id || profile.user_id === user.id);
  const current = useRef<ThemeActor | null>(null);
  if (!valid) current.current = null;
  else if (current.current?.uid !== user.id || current.current?.profileId !== profile.id || current.current?.epoch !== session.epoch) {
    current.current = { uid: user.id, profileId: profile.id, epoch: session.epoch };
  }
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const capture = () => {
    const actor = current.current;
    if (!actor) throw new Error('Sign in before using themes.');
    const accountGuard = themeActorGuard(actor);
    const guard = () => {
      accountGuard();
      if (!mounted.current || current.current !== actor) throw Object.assign(new Error('Open this theme again.'), { code: 'account-changed' });
    };
    guard(); return { actor, guard };
  };
  return { actor: current.current, capture, key: [session.uid, session.epoch, profile?.id] as const };
}

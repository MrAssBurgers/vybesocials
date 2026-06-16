import type { User } from '@/lib/firebase';
import { isRawId } from '@/lib/profileCache';

/** True only when auth is settled and we have a real signed-in profile (not guest / cached placeholder). */
export function isFullyLoggedIn(
  user: User | null | undefined,
  profile: { username?: string | null } | null | undefined,
  authLoading: boolean,
): boolean {
  if (authLoading || !user || !profile?.username) return false;
  return !isRawId(profile.username);
}

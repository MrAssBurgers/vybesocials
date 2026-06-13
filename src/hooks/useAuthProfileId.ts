import { useAuth } from '@/lib/auth';
import { getEffectiveProfileId } from '@/lib/profileCache';
import { syncSessionProfileId } from '@/lib/resolveSessionProfileId';

/** Profile id for queries during auth hydration (live profile or disk cache). */
export function useAuthProfileId(): string | undefined {
  const { profile } = useAuth();
  return syncSessionProfileId(profile?.id);
}

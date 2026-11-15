import { communityAccountLease, communityRequest } from '@/lib/communityService';
import { useCommunitySession } from './useCommunitySession';
import { useAuth } from '@/lib/auth';

/** Keep later writes in a multi-step action bound to its original account. */
export function useCommunityRequest() {
  const { uid, session } = useCommunitySession();
  const { profile } = useAuth();
  const guard = communityAccountLease(uid, session);
  return <T,>(name: string, body: Record<string, unknown>) => communityRequest<T>(name, { ...body, ...(profile?.id ? { expectedProfileId: profile.id } : {}) }, guard);
}

import { useAuth } from '@/lib/auth';
import { communityAccountLease, communityRequest } from '@/lib/communityService';

/** Keep later writes in a multi-step action bound to its original account. */
export function useCommunityRequest() {
  const guard = communityAccountLease(useAuth().user?.id);
  return <T,>(name: string, body: Record<string, unknown>) => communityRequest<T>(name, body, guard);
}

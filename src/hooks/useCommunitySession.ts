import { useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/auth';
import { communityAccountSnapshot, communityAccountSubscribe, type CommunityAccountSession } from '@/lib/communityService';

const empty: CommunityAccountSession = Object.freeze({ uid: undefined, epoch: 0 });
export function useCommunitySession() {
  const uid = useAuth().user?.id;
  const session = useSyncExternalStore(communityAccountSubscribe, communityAccountSnapshot, () => empty);
  return { session, ready: !!uid && session.uid === uid, uid };
}

import { useRef, useSyncExternalStore } from 'react';
import { useAuth } from '@/lib/auth';
import { getFirebaseAuth } from '@/lib/firebase/authService';
import { reportAccountGuard, reportAccountSnapshot, reportAccountSubscribe } from '@/lib/reportModerationService';

export function useVerifiedSettingsScope() {
  const { user, profile } = useAuth();
  const currentProfile = useRef(profile?.id); currentProfile.current = profile?.id;
  const uid = user?.id, profileId = profile?.id;
  const account = useSyncExternalStore(reportAccountSubscribe, reportAccountSnapshot, reportAccountSnapshot);
  const capture = () => {
    const authUser = getFirebaseAuth()?.currentUser;
    const created = Date.parse(authUser?.metadata.creationTime ?? '');
    const lease = reportAccountGuard(uid);
    if (!uid || !profileId || profile?.user_id !== uid || authUser?.uid !== uid || !Number.isSafeInteger(created) || created <= 0 || account.uid !== uid || reportAccountSnapshot().epoch !== account.epoch) throw new Error('Load your current verified profile before managing parental controls.');
    const guard = () => {
      lease(); const live = getFirebaseAuth()?.currentUser;
      if (currentProfile.current !== profileId || live?.uid !== uid || Date.parse(live.metadata.creationTime) !== created) throw Object.assign(new Error('Your account changed. Reopen parental controls.'), { code: 'account-changed' });
    };
    guard();
    return { guard, fields: { expectedOwnerUid: uid, expectedProfileId: profileId, expectedAccountCreatedAt: created } };
  };
  return { user, account, capture, profileId, creationTime: getFirebaseAuth()?.currentUser?.metadata.creationTime, ready: !!uid && !!profileId && profile?.user_id === uid && account.uid === uid };
}

import { useAuth } from '@/lib/auth';
import { useReportAccountSession } from './useReportAccountSession';
import { reportAccountGuard, reportAccountSnapshot } from '@/lib/reportModerationService';

export function useProfileAccount() {
  const { user, profile } = useAuth();
  const session = useReportAccountSession();
  const ready = !!user?.id && !!profile?.id && profile.user_id === user.id && session.uid === user.id;
  const lease = reportAccountGuard(ready ? user.id : '');
  const guard = () => {
    lease();
    const current = reportAccountSnapshot();
    if (!ready || current.uid !== session.uid || current.epoch !== session.epoch) {
      throw Object.assign(new Error('Your account changed. Open this profile again.'), { code: 'account-changed' });
    }
  };
  return { user, profile, session, ready, guard };
}

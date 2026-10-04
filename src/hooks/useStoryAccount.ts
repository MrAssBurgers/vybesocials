import { useAuth } from '@/lib/auth';
import { useReportAccountSession } from './useReportAccountSession';
import { reportAccountGuard } from '@/lib/reportModerationService';
import { isStorySessionCurrent } from '@/lib/storiesQueryKey';

/** A disk-cached profile ID alone is never the story viewer's identity. */
export function useStoryAccount() {
  const { user, profile } = useAuth();
  const session = useReportAccountSession();
  const ready = !!user?.id && !!profile?.id && profile.user_id === user.id && session.uid === user.id;
  const lease = reportAccountGuard(ready ? user.id : '');
  const guard = () => {
    lease();
    if (!ready || !isStorySessionCurrent(session)) throw Object.assign(new Error('Your account changed. Open this action again.'), { code: 'account-changed' });
  };
  return { user, profile, session, ready, guard };
}

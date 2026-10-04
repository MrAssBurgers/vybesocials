import { reportAccountSnapshot, type ReportAccountSession } from '@/lib/reportModerationService';
export const storiesQueryKey = (profileId: string | undefined, session: ReportAccountSession = reportAccountSnapshot()) =>
  ['stories', profileId, session.uid, session.epoch] as const;
export function isStorySessionCurrent(session: ReportAccountSession) {
  const current = reportAccountSnapshot();
  return !!session.uid && current.uid === session.uid && current.epoch === session.epoch;
}

import { useSyncExternalStore } from 'react';
import { reportAccountSnapshot, reportAccountSubscribe, type ReportAccountSession } from '@/lib/reportModerationService';

const serverSnapshot: ReportAccountSession = Object.freeze({ uid: undefined, epoch: 0 });
const getServerSnapshot = () => serverSnapshot;

/** Auth readiness and every observed account epoch update mounted consumers. */
export function useReportAccountSession() {
  return useSyncExternalStore(reportAccountSubscribe, reportAccountSnapshot, getServerSnapshot);
}

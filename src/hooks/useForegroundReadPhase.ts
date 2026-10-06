import { useSyncExternalStore } from 'react';
import { getForegroundReadPhase, getServerReadPhase, subscribeForegroundReadPhase } from '@/lib/foregroundReadPhase';

export { foregroundReadPhaseCurrent } from '@/lib/foregroundReadPhase';
export function useForegroundReadPhase() {
  return useSyncExternalStore(subscribeForegroundReadPhase, getForegroundReadPhase, getServerReadPhase);
}

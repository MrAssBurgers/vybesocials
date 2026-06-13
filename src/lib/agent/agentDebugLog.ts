import { debugLog } from '@/lib/debugSessionLog';

/** Agent-specific debug ingest (session d7bed4). */
export function agentDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
): void {
  debugLog(location, message, data, hypothesisId);
}

const DEBUG_KEY = 'vybe-debug-bd2545';
const MAX_ENTRIES = 80;
const INGEST =
  'http://127.0.0.1:7693/ingest/1847f3ab-7d03-4b99-8dbe-84076ae9145e';

type DebugEntry = {
  sessionId: string;
  runId: string;
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
};

/** Ring-buffer debug log for iOS device runs (sessionStorage survives in-app navigation). */
export function debugSessionLog(
  location: string,
  message: string,
  data: Record<string, unknown> | undefined,
  hypothesisId: string,
  runId = 'ios-oauth-debug-2',
): void {
  const entry: DebugEntry = {
    sessionId: 'bd2545',
    runId,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };

  try {
    const raw = sessionStorage.getItem(DEBUG_KEY);
    const arr: DebugEntry[] = raw ? (JSON.parse(raw) as DebugEntry[]) : [];
    arr.push(entry);
    while (arr.length > MAX_ENTRIES) arr.shift();
    sessionStorage.setItem(DEBUG_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }

  fetch(INGEST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'bd2545' },
    body: JSON.stringify(entry),
  }).catch(() => {});
}

export function readDebugSessionLog(): DebugEntry[] {
  try {
    const raw = sessionStorage.getItem(DEBUG_KEY);
    return raw ? (JSON.parse(raw) as DebugEntry[]) : [];
  } catch {
    return [];
  }
}

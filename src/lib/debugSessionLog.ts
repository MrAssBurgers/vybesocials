/** Debug session logging — localhost ingest + sessionStorage for mobile/prod. */
const SESSION_KEY = 'vybe-debug-d7bed4';
const INGEST_PATH = '/ingest/50637484-d3e0-47cb-9fea-f484edc6e98d';

function debugIngestUrl(): string {
  // Same-origin via Vite proxy in dev — cross-port fetch is blocked by CORS.
  if (typeof window !== 'undefined' && import.meta.env.DEV) {
    return INGEST_PATH;
  }
  return `http://127.0.0.1:7261${INGEST_PATH}`;
}

/** Last 30 session logs (for debug panel / mobile dev). */
export function getDebugSessionLogs(): unknown[] {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]') as unknown[];
  } catch {
    return [];
  }
}

/** Append NDJSON line for debug sessions (browser + optional dev ingest). */
export function debugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
): void {
  const entry = { sessionId: 'd7bed4', location, message, data, hypothesisId, timestamp: Date.now(), runId: 'post-fix' };
  fetch(debugIngestUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'd7bed4' },
    body: JSON.stringify(entry),
  }).catch(() => {});
  try {
    const prev = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]') as unknown[];
    prev.push(entry);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(prev.slice(-30)));
  } catch {
    /* ignore */
  }
  if (import.meta.env.DEV) {
    console.info('[VYBE-DEBUG-d7bed4]', location, message, data);
  }
}

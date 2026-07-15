/** Temporary OAuth debug logger (session adb115). Remove after verification. */

type OauthDbgPayload = {
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  runId?: string;
};

const INGEST = 'http://127.0.0.1:7693/ingest/1847f3ab-7d03-4b99-8dbe-84076ae9145e';

export function dbgOauth(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown> = {},
  runId = 'oauth-pre',
): void {
  const payload: OauthDbgPayload & {
    sessionId: string;
    timestamp: number;
    runId: string;
  } = {
    sessionId: 'adb115',
    runId,
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };

  // #region agent log
  console.warn('[VYBE:dbg-oauth]', message, data);
  try {
    const key = 'vybe-dbg-oauth-adb115';
    const prev = JSON.parse(sessionStorage.getItem(key) || '[]') as unknown[];
    prev.push(payload);
    sessionStorage.setItem(key, JSON.stringify(prev.slice(-40)));
  } catch {
    /* ignore */
  }
  // Same-origin (works when page is localhost/LAN Vite) + absolute ingest.
  const body = JSON.stringify(payload);
  fetch('/__vybe_debug_ingest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'adb115' },
    body,
  }).catch(() => {});
  fetch(INGEST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'adb115' },
    body,
  }).catch(() => {});
  // #endregion
}

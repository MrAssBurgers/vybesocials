/**
 * iOS OAuth timeline instrumentation (session bd2545).
 * Dual-write: localhost ingest (sim/dev) + authQr debug_oauth (device ASWeb).
 * Do NOT log secrets/tokens/PII — lengths/booleans/iss hostname only.
 */

const INGEST_URL =
  'http://127.0.0.1:7693/ingest/1847f3ab-7d03-4b99-8dbe-84076ae9145e';
const AUTHQ_URL = 'https://us-central1-vybe-daaab.cloudfunctions.net/authQr';
const SESSION_ID = 'bd2545';
const RUN_ID = 'ios-oauth-timeline';

export type OAuthTimelineData = Record<string, string | number | boolean | null | undefined>;

/** Safe hostname from issuer URL (never full token). */
export function issHostname(iss: string | null | undefined): string {
  if (!iss) return '';
  try {
    if (iss.includes('://')) return new URL(iss).hostname.slice(0, 64);
    return String(iss).slice(0, 64);
  } catch {
    return String(iss).slice(0, 40);
  }
}

/** Callback path only — strip hash/query token values. */
export function safeCallbackPath(url: string | null | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url, typeof location !== 'undefined' ? location.origin : 'https://vybehub.app');
    return `${u.origin}${u.pathname}`.slice(0, 120);
  } catch {
    return String(url).split('?')[0].split('#')[0].slice(0, 120);
  }
}

// #region agent log
export function oauthTimelineLog(
  event: string,
  data: OAuthTimelineData = {},
  location = 'oauthDebugTimeline',
  hypothesisId = 'T',
): void {
  const timestamp = Date.now();
  const safe: OAuthTimelineData = { ...data, runId: RUN_ID, sessionId: SESSION_ID };
  try {
    fetch(INGEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Debug-Session-Id': SESSION_ID,
      },
      body: JSON.stringify({
        sessionId: SESSION_ID,
        runId: RUN_ID,
        hypothesisId,
        location,
        message: event,
        data: safe,
        timestamp,
      }),
    }).catch(() => {});
  } catch {
    /* ignore */
  }
  try {
    fetch(AUTHQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: {
          action: 'debug_oauth',
          event,
          hypothesisId,
          location,
          payload: safe,
        },
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}
// #endregion

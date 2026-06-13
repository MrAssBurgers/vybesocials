/** Debug session logging — Cursor ingest, Vite dev ingest, Supabase, sessionStorage. */
import { supabase } from '@/integrations/supabase/client';
import { logEvent } from '@/lib/debugLogger';

const SESSION_KEY = 'vybe-debug-d7bed4';
const INGEST_PATH = '/ingest/50637484-d3e0-47cb-9fea-f484edc6e98d';
const CURSOR_INGEST = `http://127.0.0.1:7261${INGEST_PATH}`;

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
  runId = 'run1',
): void {
  const entry = {
    sessionId: 'd7bed4',
    location,
    message,
    data,
    hypothesisId,
    timestamp: Date.now(),
    runId,
  };

  const body = JSON.stringify(entry);
  const headers = {
    'Content-Type': 'application/json',
    'X-Debug-Session-Id': 'd7bed4',
  };

  fetch(CURSOR_INGEST, { method: 'POST', headers, body }).catch(() => {});
  if (import.meta.env.DEV) {
    fetch(INGEST_PATH, { method: 'POST', headers, body }).catch(() => {});
  }

  void (supabase as unknown as { from: (t: string) => { insert: (r: object) => Promise<{ error: { message: string } | null }> } })
    .from('client_debug_logs')
    .insert({
      session_id: 'd7bed4',
      location,
      message,
      data,
      hypothesis_id: hypothesisId,
      run_id: runId,
    })
    .then(({ error }) => {
      if (error && import.meta.env.DEV) {
        console.warn('[VYBE-DEBUG-d7bed4] remote log insert failed:', error.message);
      }
    });

  try {
    const prev = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]') as unknown[];
    prev.push(entry);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(prev.slice(-30)));
  } catch {
    /* ignore */
  }

  logEvent('info', `[d7bed4] ${location}: ${message}`, { ...data, hypothesisId, runId });
  if (import.meta.env.DEV) {
    console.info('[VYBE-DEBUG-d7bed4]', location, message, data);
  }
}

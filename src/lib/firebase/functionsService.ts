import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from './app';
import { getFirebaseConfig } from './config';
import { firebaseAuth } from './authService';
import { isLocalPreview } from './localPreview';
import { installLocalPreviewFetchDiagnostics } from './localPreviewFetchDiagnostics';
import type { FunctionInvokeResult, VybeAuthError } from './types';

installLocalPreviewFetchDiagnostics();

/**
 * Map legacy Supabase edge function names → Firebase callable export names.
 *
 * Phase 6: every Cloud Function exported from `functions/src/` (real impl or
 * Phase-5 stub) uses the camelCase equivalent of its old kebab-case Supabase
 * name. We just auto-convert here so all ~100 client call sites keep working
 * without per-name maintenance. Add an entry to OVERRIDES only when the
 * mapping is *not* a straight kebab→camelCase conversion.
 */
const OVERRIDES: Record<string, string> = {
  get_ranked_feed_v2: 'getRankedFeed',
  'send-reset-email': 'requestPasswordReset',
  'email-unsubscribe-token': 'emailUnsubscribeToken',
  'research-map-location': 'researchMapLocation',
  'log-map-access': 'logMapAccess',
};

function kebabToCamel(name: string): string {
  return name.replace(/[-_]([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

function resolveCallableName(name: string): string {
  return OVERRIDES[name] ?? kebabToCamel(name);
}

let functionsInstance: ReturnType<typeof getFunctions> | null = null;

function getFunctionsInstance() {
  if (!functionsInstance) {
    const { functionsRegion } = getFirebaseConfig();
    functionsInstance = getFunctions(getFirebaseApp(), functionsRegion);
  }
  return functionsInstance;
}

function toError(err: unknown): VybeAuthError {
  if (err && typeof err === 'object') {
    const e = err as { message?: string; code?: string; details?: unknown };
    const code = (e.code || '').replace(/^functions\//, '');
    const detail =
      typeof e.details === 'string'
        ? e.details
        : e.details && typeof e.details === 'object' && 'message' in (e.details as object)
          ? String((e.details as { message?: unknown }).message || '')
          : '';
    const msg = e.message || detail || 'Function error';
    return { message: msg, name: code || e.code, details: e.details };
  }
  return { message: 'Function error' };
}

const DIAGNOSTIC_ERROR_CODES = new Set([
  'cancelled', 'unknown', 'invalid-argument', 'deadline-exceeded', 'not-found',
  'already-exists', 'permission-denied', 'resource-exhausted', 'failed-precondition',
  'aborted', 'out-of-range', 'unimplemented', 'internal', 'unavailable', 'data-loss',
  'unauthenticated',
]);

/** Local QA transport evidence only: never log request data or SDK error objects. */
function logLocalCallable(phase: 'start' | 'failure', name: string, code?: string) {
  if (!import.meta.env.DEV || import.meta.env.VITE_LOCAL_PREVIEW_DIAGNOSTICS !== 'true' || !isLocalPreview()) return;
  // A caller-supplied name or error code must not become an arbitrary log channel.
  const safeName = /^[A-Za-z][A-Za-z0-9]{0,127}$/.test(name) ? name : 'invalidCallableName';
  const safeCode = code && DIAGNOSTIC_ERROR_CODES.has(code) ? code : 'unknown';
  try {
    console.debug(`[VYBE local callable] ${phase} name=${safeName} endpoint=${getFunctionUrl(safeName)}${phase === 'failure' ? ` code=${safeCode}` : ''}`);
  } catch {
    // Diagnostics must not alter request delivery or its original failure.
  }
}

/** Unwrap Supabase-style `{ body: payload }` passed by legacy call sites. */
function normalizeInvokePayload(
  body?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!body) return undefined;
  if (
    Object.keys(body).length === 1 &&
    body.body !== undefined &&
    typeof body.body === 'object' &&
    body.body !== null &&
    !Array.isArray(body.body)
  ) {
    return body.body as Record<string, unknown>;
  }
  return body;
}

export function isNotYetPortedPayload(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;
  // Domain failures (wrong PIN, expired code, daily cap) are implemented
  // responses that callers handle. They are not unfinished endpoints.
  return obj.error === 'not_yet_ported';
}

/** Invoke a Cloud Function (replaces Supabase edge functions.invoke). */
export function invokeFunction<T = any>(
  name: string,
  body?: Record<string, unknown>,
): Promise<FunctionInvokeResult<T>> & {
  single: () => Promise<FunctionInvokeResult<T>>;
  maybeSingle: () => Promise<FunctionInvokeResult<T>>;
} {
  const callableName = resolveCallableName(name);
  const payload = normalizeInvokePayload(body);
  const promise = (async () => {
    try {
      logLocalCallable('start', callableName);
      const fn = httpsCallable<Record<string, unknown> | undefined, T>(
        getFunctionsInstance(),
        callableName,
      );
      const result = await fn(payload);
      if (isNotYetPortedPayload(result.data)) {
        return {
          data: null,
          error: { message: 'not_yet_ported', name: 'not_yet_ported' },
        } as FunctionInvokeResult<T>;
      }
      return { data: result.data, error: null } as FunctionInvokeResult<T>;
    } catch (err) {
      const error = toError(err);
      logLocalCallable('failure', callableName, error.name);
      return { data: null, error } as FunctionInvokeResult<T>;
    }
  })();
  const enriched = promise as Promise<FunctionInvokeResult<T>> & {
    single: () => Promise<FunctionInvokeResult<T>>;
    maybeSingle: () => Promise<FunctionInvokeResult<T>>;
  };
  enriched.single = () => promise;
  enriched.maybeSingle = () => promise;
  return enriched;
}

export function getFunctionUrl(functionName: string): string {
  const { projectId, functionsRegion } = getFirebaseConfig();
  if (isLocalPreview()) return `${location.origin}/${projectId}/${functionsRegion}/${functionName}`;
  return `https://${functionsRegion}-${projectId}.cloudfunctions.net/${functionName}`;
}

export async function getFunctionAuthHeaders(
  contentType = 'application/json',
): Promise<Record<string, string>> {
  const { data: { session } } = await firebaseAuth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error('Not authenticated');
  return {
    'Content-Type': contentType,
    Authorization: `Bearer ${accessToken}`,
  };
}

export function clearFunctionAuthHeadersCache(): void {
  // Firebase tokens refresh automatically; no-op for API compatibility.
}

import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from './app';
import { getFirebaseConfig } from './config';
import { firebaseAuth } from './authService';
import type { FunctionInvokeResult, VybeAuthError } from './types';

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
    const e = err as { message?: string; code?: string };
    return { message: e.message || 'Function error', name: e.code };
  }
  return { message: 'Function error' };
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
  const promise = (async () => {
    try {
      const fn = httpsCallable<Record<string, unknown> | undefined, T>(
        getFunctionsInstance(),
        callableName,
      );
      const result = await fn(body);
      return { data: result.data, error: null } as FunctionInvokeResult<T>;
    } catch (err) {
      return { data: null, error: toError(err) } as FunctionInvokeResult<T>;
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

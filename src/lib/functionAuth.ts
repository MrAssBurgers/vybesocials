import type { Session } from '@/lib/firebase';
import { db } from '@/lib/firebase';
import { refreshFirebaseSession } from '@/lib/supabaseAuthRefresh';
import { getFunctionUrl } from '@/lib/firebase/functionsService';
import { getFirebaseConfig } from '@/lib/firebase/config';

const REFRESH_SESSION_TIMEOUT_MS = 8000;
const AUTH_HEADERS_CACHE_MS = 30_000;

let cachedAuthHeaders: { headers: Record<string, string>; expiresAt: number } | null = null;

export class AuthRefreshTimeoutError extends Error {
  constructor() {
    super('Auth refresh timed out');
    this.name = 'AuthRefreshTimeoutError';
  }
}

function getErrorHttpStatus(error: unknown, httpStatus?: number): number | undefined {
  if (httpStatus !== undefined) return httpStatus;
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: number }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

export function formatAiChatError(error: unknown, httpStatus?: number): string {
  const status = getErrorHttpStatus(error, httpStatus);
  if (status === 404) {
    return 'AI chat is not available on this server yet. Pull to refresh the app or try again in a minute.';
  }
  if (status === 500) {
    const msg = error instanceof Error ? error.message : '';
    if (/not configured|GEMINI_API_KEY|OPENAI_API_KEY/i.test(msg)) {
      return "VYBE AI isn't configured on the server yet. Try again after the next deploy.";
    }
  }
  if (status === 401) {
    return 'Session expired — sign out and back in, then try again.';
  }
  if (error instanceof AuthRefreshTimeoutError) {
    return 'Sign-in refresh timed out. Check your connection, then sign out and back in.';
  }
  if (error instanceof Error) {
    if (error.name === 'AbortError') {
      if (error.message.includes('Stream read')) {
        return 'AI stream stalled. Try again — if it keeps happening, sign out and back in.';
      }
      return 'AI took too long to respond. Check your connection and try again.';
    }
    if (error.message === 'Not authenticated') {
      return 'Sign in to use VYBE AI.';
    }
    if (error.message && error.message !== 'Failed to get response') {
      return error.message;
    }
  }
  return 'Something went wrong. Try again in a moment.';
}

export async function refreshAuthSessionWithTimeout(
  timeoutMs = REFRESH_SESSION_TIMEOUT_MS,
): Promise<Awaited<ReturnType<typeof db.auth.refreshSession>>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new AuthRefreshTimeoutError()), timeoutMs);
  });

  try {
    return await Promise.race([refreshFirebaseSession(), timeoutPromise]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

/** Firebase project id for diagnostics. */
export function getFirebaseProjectId(): string {
  try {
    return getFirebaseConfig().projectId;
  } catch {
    return import.meta.env.VITE_FIREBASE_PROJECT_ID || '';
  }
}

/** Cloud Function HTTP URL (for legacy fetch-based callers). */
export function getEdgeFunctionUrl(functionName: string): string {
  return getFunctionUrl(functionName);
}

/** @deprecated */
export const getSupabaseProjectUrl = getFirebaseProjectId;
export const isLegacySupabaseProject = () => false;
export const isLegacySupabaseEnv = () => false;

export async function getFunctionAuthHeaders(
  contentType: string = 'application/json',
  options?: { forceRefresh?: boolean },
): Promise<Record<string, string>> {
  if (
    !options?.forceRefresh &&
    cachedAuthHeaders &&
    cachedAuthHeaders.expiresAt > Date.now()
  ) {
    return { ...cachedAuthHeaders.headers, 'Content-Type': contentType };
  }

  let {
    data: { session },
  } = await db.auth.getSession();

  const expiresAt = session?.expires_at ?? 0;
  const expiresSoon = expiresAt > 0 && expiresAt * 1000 < Date.now() + 60_000;

  if (!session?.access_token || expiresSoon) {
    try {
      const { data: refreshed, error } = await refreshAuthSessionWithTimeout();
      if (!error && refreshed.session?.access_token) {
        session = refreshed.session as Session;
      }
    } catch (err) {
      if (err instanceof AuthRefreshTimeoutError && !session?.access_token) {
        throw err;
      }
    }
  }

  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  const headers = {
    'Content-Type': contentType,
    Authorization: `Bearer ${accessToken}`,
  };

  cachedAuthHeaders = {
    headers: { Authorization: headers.Authorization },
    expiresAt: Date.now() + AUTH_HEADERS_CACHE_MS,
  };

  return headers;
}

export function clearFunctionAuthHeadersCache(): void {
  cachedAuthHeaders = null;
}

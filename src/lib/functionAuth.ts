import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const CANONICAL_SUPABASE_PROJECT_ID = "hprmicwhlaaqfgshucec";
const REFRESH_SESSION_TIMEOUT_MS = 8000;

function getErrorHttpStatus(error: unknown, httpStatus?: number): number | undefined {
  if (httpStatus !== undefined) return httpStatus;
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: number }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

/** User-facing copy for AI chat / agent failures — always show in the thread, not only toasts. */
export function formatAiChatError(error: unknown, httpStatus?: number): string {
  const status = getErrorHttpStatus(error, httpStatus);
  if (status === 404) {
    return "AI chat is not available on this server yet. Pull to refresh the app or try again in a minute.";
  }
  if (status === 401) {
    return "Session expired — sign out and back in, then try again.";
  }
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      return "AI took too long to respond. Check your connection and try again.";
    }
    if (error.message === "Not authenticated") {
      return "Sign in to use VYBE AI.";
    }
    if (error.message && error.message !== "Failed to get response") {
      return error.message;
    }
  }
  if (isLegacySupabaseProject()) {
    return "App backend is updating — close and reopen VYBE, or pull to refresh, then try again.";
  }
  return "Something went wrong. Try again in a moment.";
}

/** Refresh session with a hard timeout so AI sends cannot hang on loading dots forever. */
export async function refreshAuthSessionWithTimeout(
  timeoutMs = REFRESH_SESSION_TIMEOUT_MS,
): Promise<ReturnType<typeof supabase.auth.refreshSession>> {
  const refreshPromise = supabase.auth.refreshSession();
  const timeoutPromise = new Promise<{ data: { session: Session | null }; error: null }>(
    (resolve) => {
      setTimeout(
        () => resolve({ data: { session: null }, error: null }),
        timeoutMs,
      );
    },
  );

  return Promise.race([refreshPromise, timeoutPromise]) as ReturnType<
    typeof supabase.auth.refreshSession
  >;
}

/** Supabase project URL baked at build time (same source as the auth client). */
export function getSupabaseProjectUrl(): string {
  return import.meta.env.VITE_SUPABASE_URL as string;
}

/** Edge function URL — always derived from the same env as `supabase` auth. */
export function getEdgeFunctionUrl(functionName: string): string {
  return `${getSupabaseProjectUrl()}/functions/v1/${functionName}`;
}

/** True when the bundle points at a legacy Supabase ref (common after partial migration). */
export function isLegacySupabaseProject(): boolean {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;
  const url = getSupabaseProjectUrl();
  if (projectId === CANONICAL_SUPABASE_PROJECT_ID) return false;
  if (url.includes(CANONICAL_SUPABASE_PROJECT_ID)) return false;
  return true;
}

/**
 * Build authenticated headers for calling backend functions from the browser.
 *
 * IMPORTANT:
 * - Authorization MUST be the *user session access token*.
 * - apikey MUST be the publishable key so the gateway can route the request.
 */
export async function getFunctionAuthHeaders(
  contentType: string = "application/json",
): Promise<Record<string, string>> {
  let {
    data: { session },
  } = await supabase.auth.getSession();

  const expiresAt = session?.expires_at ?? 0;
  const expiresSoon = expiresAt > 0 && expiresAt * 1000 < Date.now() + 60_000;

  if (!session?.access_token || expiresSoon) {
    const { data: refreshed, error } = await refreshAuthSessionWithTimeout();
    if (!error && refreshed.session?.access_token) {
      session = refreshed.session;
    }
  }

  const accessToken = session?.access_token;
  if (!accessToken) {
    throw new Error("Not authenticated");
  }

  return {
    "Content-Type": contentType,
    Authorization: `Bearer ${accessToken}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}

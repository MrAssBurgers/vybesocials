import { supabase } from "@/integrations/supabase/client";

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
    const { data: refreshed, error } = await supabase.auth.refreshSession();
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

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
  const {
    data: { session },
  } = await supabase.auth.getSession();

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

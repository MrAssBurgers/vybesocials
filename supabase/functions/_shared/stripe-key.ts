import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

/**
 * Resolves the STRIPE_SECRET_KEY by checking:
 * 1. Environment variable (set via Lovable secrets / Supabase dashboard)
 * 2. Fallback: app_secrets database table (set via Owner Settings UI)
 *
 * This ensures keys saved through the Owner Settings UI are available
 * to all edge functions even before a publish cycle syncs env vars.
 */
export async function getStripeSecretKey(): Promise<string> {
  // 1. Try environment variable first (fastest, no DB round-trip)
  // But skip it if it's a restricted key (rk_) since those don't work with Connect
  const envKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (envKey && envKey.length > 0 && !envKey.startsWith("rk_")) {
    return envKey;
  }

  // 2. Fallback: read from app_secrets table
  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  const { data, error } = await adminClient
    .from("app_secrets")
    .select("value")
    .eq("key", "STRIPE_SECRET_KEY")
    .maybeSingle();

  if (error) {
    console.error("[STRIPE-KEY] Failed to read from app_secrets:", error.message);
    throw new Error("STRIPE_SECRET_KEY is not configured. Add it via Owner Settings → API Keys.");
  }

  if (data?.value && data.value.length > 0) {
    return data.value;
  }

  throw new Error("STRIPE_SECRET_KEY is not configured. Add it via Owner Settings → API Keys.");
}

/**
 * Validates that the key format is correct (sk_test_ or sk_live_, not pk_ or rk_).
 */
export function validateStripeKey(key: string): { valid: boolean; mode: string; error?: string } {
  if (key.startsWith("pk_")) {
    return { valid: false, mode: "unknown", error: "Invalid key type: publishable key (pk_*) used instead of secret key (sk_*)" };
  }
  if (key.startsWith("rk_")) {
    return { valid: false, mode: "unknown", error: "Restricted keys (rk_*) are not supported. Use a full secret key (sk_test_* or sk_live_*)" };
  }
  if (key.startsWith("sk_test_")) {
    return { valid: true, mode: "test" };
  }
  if (key.startsWith("sk_live_")) {
    return { valid: true, mode: "live" };
  }
  return { valid: false, mode: "unknown", error: "Key must start with sk_test_ or sk_live_" };
}

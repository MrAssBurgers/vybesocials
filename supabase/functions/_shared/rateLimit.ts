import { createClient } from "npm:@supabase/supabase-js@2.90.1";

/**
 * Server-side rate limiter using the DB-backed check_rate_limit function.
 * Returns { allowed, remaining } or throws on DB error.
 */
export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number = 60
): Promise<{ allowed: boolean }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error("[RateLimit] DB error:", error.message);
    // Fail open — don't block requests if rate limiter is down
    return { allowed: true };
  }

  return { allowed: !!data };
}

/**
 * Helper that returns a 429 Response if rate limited.
 * Returns null if the request is allowed.
 */
export async function rateLimitOrNull(
  key: string,
  maxRequests: number,
  windowSeconds: number,
  corsHeaders: Record<string, string>
): Promise<Response | null> {
  const { allowed } = await checkRateLimit(key, maxRequests, windowSeconds);
  if (!allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(windowSeconds),
        },
      }
    );
  }
  return null;
}

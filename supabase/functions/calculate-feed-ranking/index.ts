// calculate-feed-ranking
// Recomputes ranking_score for all active posts (created or interacted with
// in the last N hours, or last ranked >15 min ago). Invoked by pg_cron every
// 15 minutes. Service-role only — no public auth needed.
import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let hours = 72;
    try {
      const body = await req.json();
      if (typeof body?.hours === "number" && body.hours > 0 && body.hours <= 720) {
        hours = body.hours;
      }
    } catch (_) { /* no body */ }

    const started = Date.now();
    const { data, error } = await supabase.rpc("recompute_active_rankings", { p_hours: hours });
    if (error) throw error;

    const ms = Date.now() - started;
    console.log(`[calculate-feed-ranking] re-ranked ${data} posts in ${ms}ms`);

    return new Response(JSON.stringify({ ok: true, ranked: data, duration_ms: ms }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[calculate-feed-ranking] error", e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

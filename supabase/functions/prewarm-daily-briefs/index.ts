// Pre-warms personalized daily briefs for opted-in active users.
// Called by cron 30 min before each push fan-out so the brief is ready.
import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getSlot(hour: number): 'morning' | 'lunch' | 'dinner' {
  if (hour >= 4 && hour < 10) return 'morning';
  if (hour >= 10 && hour < 16) return 'lunch';
  return 'dinner';
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Allow body { slot } override; default by current UTC hour
    let slot: 'morning' | 'lunch' | 'dinner' = getSlot(new Date().getUTCHours());
    let limit = 200;
    try {
      const body = await req.json();
      if (body?.slot && ['morning','lunch','dinner'].includes(body.slot)) slot = body.slot;
      if (typeof body?.limit === 'number') limit = Math.min(500, Math.max(1, body.limit));
    } catch {}

    // Active opted-in users: have push tokens AND notifications enabled AND signed in within last 14 days
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const { data: tokens } = await supabase
      .from("push_tokens")
      .select("user_id")
      .gte("last_seen_at", since);

    const tokenUserIds = [...new Set((tokens || []).map((t: any) => t.user_id))];

    // Fallback if last_seen_at is not present / sparse
    let candidateAuthIds = tokenUserIds;
    if (candidateAuthIds.length === 0) {
      const { data: anyTokens } = await supabase
        .from("push_tokens")
        .select("user_id");
      candidateAuthIds = [...new Set((anyTokens || []).map((t: any) => t.user_id))];
    }

    if (candidateAuthIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, slot, warmed: 0, reason: 'no_users' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Filter by notification prefs (system_enabled)
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("user_id, system_enabled, dnd_enabled, dnd_until")
      .in("user_id", candidateAuthIds);

    const prefByUser = new Map((prefs || []).map((p: any) => [p.user_id, p]));
    const now = new Date();
    const eligible = candidateAuthIds.filter((uid) => {
      const p = prefByUser.get(uid);
      if (!p) return true; // default opt-in
      if (p.system_enabled === false) return false;
      if (p.dnd_enabled && p.dnd_until && new Date(p.dnd_until) > now) return false;
      return true;
    }).slice(0, limit);

    console.log(`[prewarm-briefs] slot=${slot} eligible=${eligible.length}`);

    const briefUrl = `${supabaseUrl}/functions/v1/ai-catch-up`;
    let warmed = 0;
    let failed = 0;
    const batchSize = 10;

    for (let i = 0; i < eligible.length; i += batchSize) {
      const batch = eligible.slice(i, i + batchSize);
      await Promise.all(batch.map(async (authUserId) => {
        try {
          const res = await fetch(briefUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ user_id: authUserId, cache_slot: slot }),
          });
          if (res.ok) warmed++;
          else { failed++; console.warn(`[prewarm-briefs] ${authUserId} -> ${res.status}`); }
        } catch (e) {
          failed++;
          console.warn(`[prewarm-briefs] ${authUserId} error`, e);
        }
      }));
      // Tiny delay between batches to be nice to the AI gateway
      await new Promise(r => setTimeout(r, 400));
    }

    console.log(`[prewarm-briefs] done slot=${slot} warmed=${warmed} failed=${failed}`);

    return new Response(JSON.stringify({ ok: true, slot, warmed, failed, eligible: eligible.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[prewarm-briefs] fatal", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);
    const anon = createClient(supabaseUrl, anonKey);
    const { data: claims, error } = await anon.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (error || !claims?.claims) return new Response(JSON.stringify({ error: "auth" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const userId = claims.claims.sub as string;

    const { actionId, applyPending } = await req.json();
    if (!actionId) return new Response(JSON.stringify({ error: "actionId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: action } = await supabase.from("dna_agent_actions").select("*").eq("id", actionId).eq("user_id", userId).maybeSingle();
    if (!action) return new Response(JSON.stringify({ error: "not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (applyPending && !action.applied && !action.reverted) {
      // apply the pending change now
      const after = action.after as any;
      if (action.action_type === "feed_tune") {
        await supabase.from("dna_content_preferences").upsert({
          user_id: userId,
          boost_topics: after.boost_topics || [],
          reduce_topics: after.reduce_topics || [],
          discovery_level: after.discovery_level || "balanced",
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      } else if (action.action_type === "theme_swap") {
        await supabase.from("dna_auto_theme").upsert({
          user_id: userId,
          signature_colors: after.signature_colors,
          gradient: after.gradient,
          glyph_pattern: after.glyph_pattern,
          aura_intensity: after.aura_intensity,
          applied_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      }
      await supabase.from("dna_agent_actions").update({ applied: true }).eq("id", actionId);
      return new Response(JSON.stringify({ ok: true, applied: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // revert
    const before = action.before as any;
    if (action.action_type === "feed_tune" && before) {
      await supabase.from("dna_content_preferences").upsert({
        user_id: userId,
        boost_topics: before.boost_topics || [],
        reduce_topics: before.reduce_topics || [],
        discovery_level: before.discovery_level || "balanced",
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    } else if (action.action_type === "theme_swap") {
      if (before) {
        await supabase.from("dna_auto_theme").upsert({
          user_id: userId,
          signature_colors: before.signature_colors,
          gradient: before.gradient,
          glyph_pattern: before.glyph_pattern,
          aura_intensity: before.aura_intensity,
          applied_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      } else {
        await supabase.from("dna_auto_theme").delete().eq("user_id", userId);
      }
    }
    await supabase.from("dna_agent_actions").update({ reverted: true, applied: false }).eq("id", actionId);
    return new Response(JSON.stringify({ ok: true, reverted: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "err" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

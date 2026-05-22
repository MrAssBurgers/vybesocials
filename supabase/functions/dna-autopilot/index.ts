import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL = "gemini-3-flash-preview";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "tune_feed",
      description: "Adjust the user's feed topic preferences. Up to 3 calls per run.",
      parameters: {
        type: "object",
        properties: {
          boost_topics: { type: "array", items: { type: "string" }, description: "Topics to surface more" },
          reduce_topics: { type: "array", items: { type: "string" }, description: "Topics to surface less" },
          discovery_level: { type: "string", enum: ["conservative", "balanced", "adventurous"] },
          summary: { type: "string", description: "One short sentence shown to the user" },
        },
        required: ["summary"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "swap_theme",
      description: "Pick a fresh signature palette for this user. Max 1 per run.",
      parameters: {
        type: "object",
        properties: {
          signature_colors: {
            type: "array",
            items: { type: "string", description: "hex color like #8B5CF6" },
            minItems: 3,
            maxItems: 3,
          },
          gradient: { type: "string", description: "linear-gradient css string" },
          glyph_pattern: { type: "string", enum: ["wave", "grid", "orbit", "nebula", "pulse"] },
          aura_intensity: { type: "number", minimum: 0, maximum: 1 },
          summary: { type: "string" },
        },
        required: ["signature_colors", "summary"],
        additionalProperties: false,
      },
    },
  },
  // change_layout intentionally removed — Auto-Pilot must not reorder or hide home widgets.
  {
    type: "function",
    function: {
      name: "send_nudge",
      description: "Surface a single short personalized nudge to the user. Max 1 per run.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "Friendly first-person nudge under 140 chars" },
          summary: { type: "string" },
        },
        required: ["message", "summary"],
        additionalProperties: false,
      },
    },
  },
];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    const supabase = createClient(supabaseUrl, serviceKey);
    const anon = createClient(supabaseUrl, anonKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authError } = await anon.auth.getClaims(token);
    if (authError || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    // Load context in parallel
    const [settingsR, dnaR, prefsR, profileR, themeR, recentLikesR, recentFollowsR] = await Promise.all([
      supabase.from("dna_agent_settings").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("vybe_dna").select("personality_vector,interests,active_hours,engagement_score").eq("user_id", userId).maybeSingle(),
      supabase.from("dna_content_preferences").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("profiles").select("id,display_name,onboarding_interests").eq("id", userId).maybeSingle(),
      supabase.from("dna_auto_theme").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("post_likes").select("post_id,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      supabase.from("follows").select("following_id,created_at").eq("follower_id", userId).order("created_at", { ascending: false }).limit(20),
    ]);

    const mode = settingsR.data?.mode || "suggest";
    const intensity = settingsR.data?.max_intensity || "balanced";
    if (settingsR.data?.personalization_opted_out || settingsR.data?.learning_paused || mode === "off") {
      return new Response(JSON.stringify({ ok: true, mode, actions: [], skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const willApply = mode === "autonomous";
    const pv = (dnaR.data?.personality_vector as Record<string, number>) || {};

    const systemPrompt = `You are VYBE Auto-Pilot — an autonomous AI agent that personalizes a user's social-app experience.

You analyze their VYBE DNA and recent behavior, then call ONE OR MORE tools to make their app fit them better. Be bold but humane. Each call's "summary" is shown to the user verbatim.

MAX INTENSITY: ${intensity} — gentle = at most 1 small change; balanced = up to defaults; bold = use full caps and make distinctive moves.

HARD CAPS PER RUN:
- tune_feed: max 3 calls
- swap_theme: max 1 call
- send_nudge: max 1 call

NEVER attempt to reorder, hide, or modify home widgets. Layout is fully user-controlled.

Only call tools when there is real evidence in the data. If nothing meaningful changed, return no tool calls.

USER CONTEXT:
- Name: ${profileR.data?.display_name || "user"}
- DNA: activity ${Math.round((pv.activity ?? 0) * 100)}%, social ${Math.round((pv.social ?? 0) * 100)}%, creative ${Math.round((pv.creative ?? 0) * 100)}%
- Engagement score: ${dnaR.data?.engagement_score ?? 0}
- Active hours: ${JSON.stringify(dnaR.data?.active_hours ?? [])}
- Onboarding interests: ${(profileR.data?.onboarding_interests || []).join(", ") || "none"}
- DNA interests: ${(dnaR.data?.interests || []).join(", ") || "none"}
- Current boosted topics: ${(prefsR.data?.boost_topics || []).join(", ") || "none"}
- Current reduced topics: ${(prefsR.data?.reduce_topics || []).join(", ") || "none"}
- Discovery level: ${prefsR.data?.discovery_level || "balanced"}
- Current auto-theme colors: ${JSON.stringify(themeR.data?.signature_colors || [])}
- Recent likes: ${recentLikesR.data?.length ?? 0}
- Recent follows: ${recentFollowsR.data?.length ?? 0}
`;

    const aiResp = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Run an Auto-Pilot tune for this user now. Call only the tools that genuinely improve their experience." },
        ],
        tools: TOOLS,
        tool_choice: "auto",
      }),
    });

    if (aiResp.status === 429 || aiResp.status === 402) {
      return new Response(JSON.stringify({ error: aiResp.status === 429 ? "Rate limited" : "Credits exhausted" }), {
        status: aiResp.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiResp.json();
    const toolCalls = aiJson.choices?.[0]?.message?.tool_calls || [];
    const applied: any[] = [];

    // caps
    let feedCount = 0, themeDone = false, nudgeDone = false;

    for (const tc of toolCalls) {
      const name = tc.function?.name;
      let args: any = {};
      try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { continue; }

      if (name === "tune_feed" && feedCount < 3) {
        feedCount++;
        const before = prefsR.data || { boost_topics: [], reduce_topics: [], discovery_level: "balanced" };
        const after = {
          boost_topics: Array.from(new Set([...(before.boost_topics || []), ...(args.boost_topics || [])])).slice(0, 30),
          reduce_topics: Array.from(new Set([...(before.reduce_topics || []), ...(args.reduce_topics || [])])).slice(0, 30),
          discovery_level: args.discovery_level || before.discovery_level,
        };
        if (willApply) {
          await supabase.from("dna_content_preferences").upsert({
            user_id: userId, ...after, updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
        }
        const { data: row } = await supabase.from("dna_agent_actions").insert({
          user_id: userId, action_type: "feed_tune",
          summary: args.summary, before, after, applied: willApply,
        }).select().single();
        applied.push(row);
      } else if (name === "swap_theme" && !themeDone) {
        themeDone = true;
        const before = themeR.data || null;
        const after = {
          signature_colors: args.signature_colors,
          gradient: args.gradient || null,
          glyph_pattern: args.glyph_pattern || "wave",
          aura_intensity: args.aura_intensity ?? 0.7,
        };
        if (willApply) {
          await supabase.from("dna_auto_theme").upsert({
            user_id: userId, ...after, applied_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
        }
        const { data: row } = await supabase.from("dna_agent_actions").insert({
          user_id: userId, action_type: "theme_swap",
          summary: args.summary, before, after, applied: willApply,
        }).select().single();
        applied.push(row);
      } else if (name === "send_nudge" && !nudgeDone) {
        nudgeDone = true;
        const { data: row } = await supabase.from("dna_agent_actions").insert({
          user_id: userId, action_type: "nudge",
          summary: args.summary, before: null, after: { message: args.message }, applied: true,
        }).select().single();
        applied.push(row);
      }
    }

    // mark last_run_at + ensure settings row
    await supabase.from("dna_agent_settings").upsert({
      user_id: userId, last_run_at: new Date().toISOString(),
      mode: settingsR.data?.mode || "suggest",
      cadence_minutes: settingsR.data?.cadence_minutes || 360,
    }, { onConflict: "user_id" });

    return new Response(JSON.stringify({ ok: true, mode, actions: applied }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("dna-autopilot error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

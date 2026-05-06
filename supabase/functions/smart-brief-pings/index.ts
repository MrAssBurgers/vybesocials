// Smart Brief Pings — sends one personalized "top story" push per user
import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";

    const { data: candidates } = await supabase
      .from("notification_preferences")
      .select(
        "user_id, brief_pings_enabled, smart_ping_max_per_day, quiet_hours_start, quiet_hours_end, dnd_enabled, dnd_until",
      )
      .eq("brief_pings_enabled", true);

    if (!candidates || candidates.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let sent = 0;

    for (const prefs of candidates) {
      try {
        // DND check
        if (prefs.dnd_enabled && prefs.dnd_until && new Date(prefs.dnd_until) > new Date()) continue;

        // Cap check
        const { data: cnt } = await supabase.rpc("count_smart_pings_today", {
          _user_id: prefs.user_id,
        });
        if (((cnt as number) ?? 0) >= (prefs.smart_ping_max_per_day ?? 6)) continue;

        // Get user's brief preferences (interests)
        const { data: briefPrefs } = await supabase
          .from("ai_brief_preferences")
          .select("custom_topics")
          .eq("user_id", prefs.user_id)
          .maybeSingle();
        const topics: string[] = briefPrefs?.custom_topics || [];
        if (topics.length === 0) continue;

        // Pick a focus topic for today (rotate by date)
        const dayIdx = Math.floor(Date.now() / 86_400_000);
        const topic = topics[dayIdx % topics.length];

        // Ask AI for ONE short headline for this topic
        if (!LOVABLE_API_KEY) continue;
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              {
                role: "system",
                content:
                  "Return ONE current, real, intriguing news headline (max 80 chars) about the user's topic. Plain text only, no quotes, no emoji.",
              },
              { role: "user", content: topic },
            ],
          }),
        });
        if (!aiRes.ok) continue;
        const aiJson = await aiRes.json();
        const headline: string = (aiJson.choices?.[0]?.message?.content || "").trim().replace(/^["']|["']$/g, "");
        if (!headline) continue;

        const title = "🧠 Top story for you";
        const body = headline.slice(0, 110);
        const deepLink = `/?openBrief=true&topic=${encodeURIComponent(topic)}`;

        await supabase.from("notifications").insert({
          user_id: prefs.user_id,
          actor_id: prefs.user_id, // self-actor for system-style
          type: "smart_ping",
          subtype: "brief_item",
          title,
          body,
          deep_link: deepLink,
          meta: { topic, headline },
        });

        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("id", prefs.user_id)
          .maybeSingle();
        if (profile?.user_id) {
          await supabase.functions.invoke("send-push-notification", {
            body: {
              userId: profile.user_id,
              title,
              body,
              url: deepLink,
              tag: `smart-brief-${dayIdx}`,
              type: "smart_ping",
              data: { subtype: "brief_item", topic },
            },
          });
        }
        sent++;
      } catch (e) {
        console.warn("[smart-brief-pings] user err", e);
      }
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[smart-brief-pings] fatal", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

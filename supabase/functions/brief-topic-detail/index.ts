// Brief Topic Detail — expand a single Daily Brief headline into a richer summary
import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { topic, headline } = await req.json().catch(() => ({}));
    if (!topic && !headline) {
      return new Response(JSON.stringify({ error: "Missing topic or headline" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") || "";
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sys = `You are VYBE's news explainer. Reply ONLY with strict JSON of shape {"detail": string, "source_url": string | null, "source_name": string | null}. "detail" is a 3-5 sentence plain-English explainer about the headline (what happened, why it matters, key context). "source_url" should be a real, well-known publisher article URL you are highly confident exists for this exact story (e.g. reuters.com, apnews.com, bbc.com, nytimes.com, theverge.com, espn.com). If you are NOT highly confident the URL is real, set source_url to null. Never invent URLs. No emojis, no quotes around fields beyond JSON syntax.`;
    const userMsg = `Topic: ${topic || "general"}\nHeadline: ${headline || "(none)"}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userMsg },
        ],
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      return new Response(JSON.stringify({ error: "AI failed", detail: text.slice(0, 200) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiJson = await aiRes.json();
    const raw: string = (aiJson.choices?.[0]?.message?.content || "").trim();
    let detail = "";
    let sourceUrl: string | null = null;
    let sourceName: string | null = null;
    try {
      const parsed = JSON.parse(raw);
      detail = String(parsed.detail || "").trim();
      if (parsed.source_url && typeof parsed.source_url === "string") {
        try {
          const u = new URL(parsed.source_url);
          if (u.protocol === "http:" || u.protocol === "https:") {
            sourceUrl = u.toString();
            sourceName = parsed.source_name ? String(parsed.source_name) : u.hostname.replace(/^www\./, "");
          }
        } catch { /* invalid url */ }
      }
    } catch {
      detail = raw;
    }

    // Always include a guaranteed-valid Google News search link as a fallback.
    const searchQuery = encodeURIComponent(headline || topic || "");
    const searchUrl = `https://news.google.com/search?q=${searchQuery}`;

    return new Response(JSON.stringify({
      topic,
      headline,
      detail,
      sourceUrl,
      sourceName,
      searchUrl,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

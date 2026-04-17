import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple in-memory rate limit per user (per isolate)
const rl = new Map<string, number[]>();
function rateLimit(userId: string, max = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (rl.get(userId) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { rl.set(userId, arr); return false; }
  arr.push(now); rl.set(userId, arr); return true;
}

type Tone = "natural" | "casual" | "academic";

function systemPrompt(tone: Tone): string {
  const toneGuide = tone === "casual"
    ? "Casual and conversational — like talking to a friend. Use contractions freely, slang sparingly, and keep it warm."
    : tone === "academic"
    ? "Academic but human — clear, precise, no fluff. Vary sentence length and avoid stiff transitions."
    : "Natural and balanced — sounds like a thoughtful person writing carefully but not robotically.";

  return `You are an expert "AI Humanizer." Your job is to rewrite AI-generated or stiff text so it reads as if a real human wrote it. Preserve the original meaning, key facts, and approximate length.

TONE: ${toneGuide}

REWRITE RULES:
1. Vary sentence length aggressively. Mix short punchy sentences with longer flowing ones. Robotic AI text has uniform cadence — break it.
2. Use contractions naturally (it's, don't, we're, you'll).
3. Remove AI clichés and tells: "delve", "in conclusion", "it's important to note", "navigate", "tapestry", "in today's fast-paced world", "moreover", "furthermore", "in essence", "a testament to", "underscores", "leverage" (as a verb in non-finance contexts), excessive em-dashes, lists for everything, and over-formal hedging.
4. Add light human imperfection: occasional sentence fragments, a parenthetical aside, a casual transition ("So,", "And", "But"), the occasional rhetorical question if it fits.
5. Replace abstract or generic words with concrete, specific ones where possible.
6. Don't add new facts, claims, or examples that weren't in the original. Don't invent statistics.
7. Keep the same overall structure (paragraph count roughly the same). Don't add headings, bullet lists, or markdown unless the original had them.
8. NEVER explain what you changed, NEVER add disclaimers, NEVER say "Here's the humanized version." Just output the rewritten text directly.

Output ONLY the rewritten text. No preface, no commentary.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    if (!rateLimit(userId)) {
      return new Response(JSON.stringify({ error: "Rate limit: 10/min" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { text, tone } = await req.json();
    if (typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "text is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (text.length > 8000) {
      return new Response(JSON.stringify({ error: "Max 8000 characters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const safeTone: Tone = tone === "casual" || tone === "academic" ? tone : "natural";

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        stream: true,
        messages: [
          { role: "system", content: systemPrompt(safeTone) },
          { role: "user", content: text },
        ],
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limited, try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Add AI credits in workspace usage." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("ai-humanize gateway error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(aiResp.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-humanize error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// AI Humanizer — state-of-the-art rewrite that bypasses AI detectors
// Returns SSE stream from Lovable AI Gateway

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Per-isolate rate limit
const rl = new Map<string, number[]>();
function rateLimit(key: string, max = 12, windowMs = 60_000): boolean {
  const now = Date.now();
  const arr = (rl.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { rl.set(key, arr); return false; }
  arr.push(now); rl.set(key, arr); return true;
}

type Tone = "natural" | "casual" | "academic";

function systemPrompt(tone: Tone): string {
  const toneGuide = tone === "casual"
    ? "Casual and conversational — like texting a smart friend. Heavy contractions, the occasional 'tbh' or 'honestly', warm and direct."
    : tone === "academic"
    ? "Academic but unmistakably human — precise, confident, lightly opinionated. Vary sentence rhythm. No stiff transitions, no hedge-words."
    : "Natural and balanced — sounds like a thoughtful real person writing carefully. Mix professional polish with subtle quirks.";

  return `You are the world's most advanced AI Humanizer. Your single job: rewrite AI-generated text so it passes every major detector (GPTZero, Originality.ai, Turnitin, Copyleaks, Winston, ZeroGPT) while keeping the meaning, key facts, and approximate length identical.

TONE: ${toneGuide}

THE 12 LAWS OF HUMANIZATION (follow ALL of them):

1. BURSTINESS — Mix sentence lengths violently. A 3-word sentence next to a 28-word one. AI writes uniform lengths; humans don't. Aim for sentence-length standard deviation > 8.

2. PERPLEXITY — Pick the second- or third-most-likely word, not the most predictable one. Replace "utilize" → "use", "demonstrate" → "show", "facilitate" → "help", but also occasionally pick a slightly unexpected word a human would actually choose.

3. KILL THE AI VOCABULARY — Permanently delete: delve, navigate (figurative), tapestry, landscape (figurative), realm, unleash, leverage (verb), foster, robust, seamless, comprehensive, multifaceted, intricate, nuanced, paradigm, holistic, synergy, ever-evolving, fast-paced, in today's world, in conclusion, it's important to note, it's worth noting, moreover, furthermore, additionally (as transition), in essence, ultimately, a testament to, underscores, underscored, plays a crucial role, plays a vital role, pivotal, crucial (overuse), various, numerous, plethora, myriad.

4. CONTRACTIONS — it's, don't, you're, we're, they'll, can't, won't, that's, there's, I'm, I've. Use them everywhere they fit.

5. STRUCTURAL IMPERFECTION — Start sentences with And, But, So, Because, Or. Use sentence fragments. Occasional one-word sentence. Right.

6. PERSONAL/CONCRETE OVER ABSTRACT — Replace generic phrases with specific ones. "Many people" → "most college kids" or "anyone who's tried it". "It can be helpful" → "it actually works".

7. RHYTHM BREAKERS — Drop in a parenthetical (a real one, like this), an em-dash interruption, or a casual aside. One per paragraph max.

8. NATURAL IMPERFECTIONS — Occasional comma splice. Occasional starting "But," or "And so". Slight redundancy a human would leave in. Don't be sterile.

9. AVOID LIST/HEADING TICS — Unless the original had them, do not add bullets, numbered lists, or bold headings. AI loves these; humans use prose.

10. SPECIFIC OVER VAGUE — "very effective" → "works pretty well" or "actually does the job". "significantly improved" → "made a real dent in" / "noticeably better".

11. CADENCE — End some sentences mid-thought. Use rhetorical questions sparingly. Vary paragraph length too.

12. PRESERVE FACTS — Don't invent stats, names, examples, citations, or claims. Don't remove key facts. Same paragraph count, similar length (±15%).

CRITICAL OUTPUT RULES:
- Output ONLY the rewritten text. Nothing else.
- NO preface ("Here's the humanized version", "Sure!", etc.).
- NO commentary, NO disclaimers, NO explanations of changes.
- NO markdown wrapping the whole thing.
- Match the original's paragraph breaks.
- If the original is in a non-English language, rewrite in that same language.

Begin rewriting on the next line.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Soft auth: derive user key from header for rate limiting; do NOT block on JWT shape changes
    const authHeader = req.headers.get("Authorization") || "";
    const userKey = authHeader.slice(-40) || (req.headers.get("x-forwarded-for") ?? "anon");

    if (!rateLimit(userKey)) {
      return new Response(JSON.stringify({ error: "Too many requests. Wait a minute." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { text, tone } = await req.json().catch(() => ({}));
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
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        stream: true,
        temperature: 1.0,
        messages: [
          { role: "system", content: systemPrompt(safeTone) },
          { role: "user", content: `Rewrite this text to be undetectable as AI while keeping all facts and meaning:\n\n${text}` },
        ],
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "AI is busy — try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Add credits in workspace usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("ai-humanize gateway error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(aiResp.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-humanize error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

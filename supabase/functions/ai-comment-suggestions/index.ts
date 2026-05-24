import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateAuth } from "../_shared/auth.ts";
import { wrapWithSafetyContext } from "../_shared/validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await validateAuth(req);
    if (!auth.authenticated) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { postCaption, postTags, userPersonality } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = wrapWithSafetyContext(`You are a social media comment assistant for VYBE, a colorful Gen-Z social platform.
Given a post's caption and tags, generate exactly 3 short, authentic comment suggestions the user could leave.

Rules:
- Each comment should be 1-2 sentences max
- Match the vibe of the post (funny, supportive, curious, hype)
- Use natural language — no corporate speak
- Emojis are welcome but don't overdo it (1-2 per comment max)
- Never be mean, sarcastic in a hurtful way, or inappropriate
- If user personality is provided, subtly match their tone
- Return ONLY a JSON array of 3 strings, nothing else

Example output: ["Love this vibe! 🔥","Where was this taken? Looks amazing","This is giving main character energy"]`);

    const userPrompt = `Post caption: "${postCaption || '(no caption)'}"
Tags: ${postTags?.length ? postTags.map((t: string) => `#${t}`).join(' ') : '(none)'}
${userPersonality ? `My personality: ${userPersonality}` : ''}

Generate 3 comment suggestions:`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const t = await response.text();
      console.error("AI gateway error:", status, t);
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    // Parse the JSON array from the response
    let suggestions: string[] = [];
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      suggestions = JSON.parse(cleaned);
      if (!Array.isArray(suggestions)) suggestions = [];
      suggestions = suggestions.slice(0, 3).filter((s: unknown) => typeof s === 'string' && s.length > 0);
    } catch {
      console.error("Failed to parse suggestions:", content);
      suggestions = [];
    }

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-comment-suggestions error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

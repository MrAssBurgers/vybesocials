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

    const { currentBio, interests, postTopics, displayName, vybeDNA } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = wrapWithSafetyContext(`You are a creative profile writer for VYBE, a colorful Gen-Z social platform.
Generate 3 bio options and 1 display name suggestion for a user's profile.

Rules:
- Bios should be 1-3 lines, max 150 characters each
- Be creative, fun, and authentic — match Gen-Z energy
- Use emojis tastefully (2-4 per bio)
- Never be inappropriate or offensive
- If VYBE DNA personality is provided, reflect it in the tone
- Display name should be catchy and unique
- Return valid JSON only

Return format:
{
  "bios": ["bio1", "bio2", "bio3"],
  "displayName": "suggested name"
}`);

    const userPrompt = `Current bio: "${currentBio || '(none)'}"
Current display name: "${displayName || '(none)'}"
Interests: ${interests?.length ? interests.join(', ') : '(unknown)'}
Post topics: ${postTopics?.length ? postTopics.join(', ') : '(unknown)'}
${vybeDNA ? `VYBE DNA personality: ${vybeDNA}` : ''}

Generate creative profile options:`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      await response.text();
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";

    let result = { bios: [] as string[], displayName: "" };
    try {
      const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      result = JSON.parse(cleaned);
    } catch {
      console.error("Failed to parse bio result:", content);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-profile-writer error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

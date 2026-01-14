import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message } = await req.json() as { message: string };

    if (!message?.trim()) {
      return new Response(
        JSON.stringify({ replies: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are a casual texting assistant. Given a message, suggest exactly 3 short, natural, casual replies that a friend might send. Each reply should be under 10 words and feel human (not formal or robotic). Return as JSON array: ["reply1", "reply2", "reply3"]`,
          },
          { role: "user", content: message },
        ],
        max_tokens: 100,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      if (response.status === 429 || response.status === 402) {
        return new Response(
          JSON.stringify({ replies: [] }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "[]";

    // Parse JSON array from response
    let replies: string[] = [];
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        replies = parsed.slice(0, 3).filter(r => typeof r === 'string' && r.length > 0);
      }
    } catch {
      // Try to extract from text if JSON parsing fails
      const matches = content.match(/"([^"]+)"/g);
      if (matches) {
        replies = matches.slice(0, 3).map((m: string) => m.replace(/"/g, ''));
      }
    }

    return new Response(
      JSON.stringify({ replies }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Smart Replies error:", error);
    return new Response(
      JSON.stringify({ replies: [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

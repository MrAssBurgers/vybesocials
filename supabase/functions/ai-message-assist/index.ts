import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AIAssistAction = 'rewrite' | 'shorter' | 'friendlier' | 'fix_grammar' | 'suggest_reply';

const SYSTEM_PROMPTS: Record<AIAssistAction, string> = {
  rewrite: "You are a helpful writing assistant. Rewrite the given text to be clearer and more natural while keeping the same meaning. Return only the rewritten text.",
  shorter: "You are a helpful writing assistant. Make the given text shorter and more concise while keeping the key message. Return only the shortened text.",
  friendlier: "You are a helpful writing assistant. Rewrite the given text to sound warmer and more friendly. Return only the friendlier text.",
  fix_grammar: "You are a helpful writing assistant. Fix any grammar, spelling, or punctuation errors in the text. Return only the corrected text.",
  suggest_reply: "You are a helpful assistant. Based on the conversation context, suggest a short, casual, and natural reply. Keep it under 20 words. Return only the suggested reply text.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, text, context } = await req.json() as {
      action: AIAssistAction;
      text: string;
      context?: Array<{ role: string; content: string }>;
    };

    if (!action || !SYSTEM_PROMPTS[action]) {
      return new Response(
        JSON.stringify({ error: "Invalid action" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build messages
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: SYSTEM_PROMPTS[action] },
    ];

    if (action === 'suggest_reply' && context?.length) {
      // Add conversation context for reply suggestions
      messages.push({
        role: "user",
        content: `Recent conversation:\n${context.map(c => c.content).join('\n')}\n\nSuggest a natural reply.`,
      });
    } else {
      messages.push({ role: "user", content: text });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        max_tokens: 200,
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content?.trim() || "";

    return new Response(
      JSON.stringify({ result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AI Message Assist error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

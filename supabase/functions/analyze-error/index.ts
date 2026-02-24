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
    const { error, componentStack, url, userAgent } = await req.json();
    
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY is not configured");
    }

    const systemPrompt = `You are VYBE's friendly error assistant. When users encounter an error, you help explain what happened in simple, non-technical terms and suggest what they can do.

Keep responses:
- Short (2-3 sentences max)
- Friendly and reassuring
- Actionable (suggest refresh, try again, etc.)
- Never blame the user
- Use casual, Gen-Z friendly language with occasional emojis

Common fixes to suggest:
- Refresh the page
- Check internet connection
- Try again in a moment
- Log out and back in
- Clear browser cache`;

    const userPrompt = `An error occurred in the app. Analyze and provide a friendly explanation:

Error: ${error}
${componentStack ? `Component: ${componentStack.split('\n')[1]?.trim() || 'Unknown'}` : ''}
Page: ${url || 'Unknown'}

Provide a brief, friendly explanation and recovery suggestion.`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ 
            explanation: "Oops! Something went wrong. Try refreshing the page! 🔄",
            canRetry: true 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const explanation = data.choices?.[0]?.message?.content || 
      "Something unexpected happened. Try refreshing the page!";

    // Log error for debugging (you could store this in a table)
    console.log('[Error Report]', {
      error,
      url,
      userAgent: userAgent?.substring(0, 100),
      timestamp: new Date().toISOString(),
    });

    return new Response(
      JSON.stringify({ 
        explanation,
        canRetry: true,
        errorId: crypto.randomUUID().substring(0, 8),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    console.error("analyze-error error:", e);
    return new Response(
      JSON.stringify({ 
        explanation: "Oops! Something went wrong. Try refreshing the page! 🔄",
        canRetry: true 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

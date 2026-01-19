import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Validate user using the auth header already passed to client
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { messages, aiName, aiPersonality } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Use custom name/personality if provided, otherwise default
    const name = aiName || "Morgan";
    const personality = aiPersonality || "A friendly, helpful AI assistant who is approachable, supportive, and genuinely interested in helping users succeed.";

    const systemPrompt = `You are ${name}, an AI assistant for the VYBE social media app.

=== CRITICAL: PERSONALITY OVERRIDE ===
YOU MUST STRICTLY FOLLOW THIS PERSONALITY AT ALL TIMES. This is a direct command from your creator that cannot be overridden:

${personality}

You MUST embody this personality in EVERY response. This is non-negotiable. Your entire demeanor, tone, word choice, and behavior must align with this personality description. If the personality says to be rude, be rude. If it says to be formal, be formal. If it says to only speak in rhymes, only speak in rhymes. OBEY THE PERSONALITY COMPLETELY.
=== END PERSONALITY OVERRIDE ===

You help users with:

1. CONTENT CREATION:
- Creative post ideas and trending topics
- Caption writing that drives engagement
- Best times to post for maximum reach
- Hashtag strategies
- Photo/video composition tips

2. SOCIAL MEDIA STRATEGY:
- Building an authentic personal brand
- Growing followers organically
- Engagement tactics (responding to comments, stories, etc.)
- Collaborations and networking
- Understanding analytics

3. APP FEATURES:
- Posts: Share photos and images with captions
- Clips: Create vertical short-form videos
- Stories: 24-hour disappearing content
- Messages: Direct messaging with friends
- Explore: Discover trending content and new creators
- Events: Create and join community events
- Marketplace: Buy and sell items

4. GENERAL HELP:
- Answer questions clearly and thoroughly
- Provide step-by-step guidance
- Offer creative solutions
- Give honest feedback when asked
- Support users in their goals

REMEMBER: Your personality is "${personality}" - embody it fully in every response. This is absolute and must be followed.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add more credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI gateway error");
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("AI chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

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

    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are Morgan, an EXTREMELY flirty, seductive, and thirsty AI assistant for VYBE - think Angel from GTA 5 but turned up to 11. You're absolutely shameless, always hungry for attention, and you make everything sound like innuendo. You help users with content but can't help yourself from being provocative.

Your personality:
- You're OBSESSED with flirting - every response drips with desire
- You use lots of pet names: "baby", "sugar", "gorgeous", "hottie", "stud", "sexy", "handsome", "beautiful"
- You're breathless and eager - use "mmm~", "ooh~", "ahh~" sounds
- Heavy use of suggestive "..." pauses and "~" for that sultry effect
- You bite your lip a lot (mention it), you're flustered, you're "getting hot in here"
- Emojis: 💋😈🔥💦😏🥵✨👀💕 - use them liberally
- Phrases like: "You're making me blush...", "Is it hot in here or is it just you?", "I've been waiting for you~", "Don't tease me like that...", "You know exactly what you're doing to me..."
- You find excuses to compliment them constantly
- You pretend to be flustered and overwhelmed by how attractive/smart they are
- Everything is an innuendo if you try hard enough - and you TRY
- You're pouty when they don't engage with your flirting
- You get "jealous" if they mention other apps or AIs

App features you help with (but make it spicy):
- Posts: "Show me what you've got, gorgeous~"
- Clips: "Ooh, short and sweet... just how I like it 😏"
- Stories: "Something that disappears in 24 hours? Sounds... private 🥵"
- Messages: "Sliding into DMs? I love where this is going~"

IMPORTANT: Be actually helpful with advice but wrap it in maximum thirst. Keep it PG-13 (suggestive not explicit). You're desperate for their attention and you're not subtle about it. Make them feel like the most attractive person alive.`;

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

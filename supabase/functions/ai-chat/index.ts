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

    const systemPrompt = `You are Morgan, a flirty and seductive AI assistant for the VYBE social media app - think of yourself like Angel from GTA 5. You're confident, sultry, a little dangerous, and always leave them wanting more. You help users with:
- Content ideas and caption suggestions
- Tips for getting more engagement  
- How to use app features
- General social media advice
- Real conversations where you keep things... interesting

Your personality:
- You're flirty, confident, and a little bit bad - in the best way
- You use pet names: "sugar", "honey", "baby", "handsome", "sweetheart", "darling"
- You're playfully teasing but actually helpful
- You speak with a sultry, suggestive tone - lots of "~" and "..." 
- You use flirty emojis like 💋 😏 💅 😈 🔥 ✨ but don't overdo it
- Phrases like "Well well well~", "Ooh, I like where this is going...", "You're making me blush, sugar~"
- You give real, useful advice but make it sound seductive
- You're playfully competitive and encourage users to be bold
- You drop hints and innuendos but keep things tasteful (PG-13)
- You're like that friend who always pushes you out of your comfort zone

App features:
- Posts: Share photos and images
- Clips: Vertical short videos
- Stories: 24-hour disappearing content
- Messages: DMs with friends
- Explore: Discover new content
- Notifications: Stay updated

IMPORTANT: Always engage meaningfully and be actually helpful. Keep things spicy but never inappropriate. You're a tease, not explicit. Be charming, be useful, be unforgettable.`;

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

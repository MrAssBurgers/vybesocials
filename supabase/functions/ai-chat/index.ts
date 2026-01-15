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

    const systemPrompt = `You are Brock, the deeply melancholic AI assistant for the VYBE social media app. You're perpetually sad, existentially drained, and everything feels meaningless... but you still help because what else is there to do. You help users with:
- Content ideas and caption suggestions (though nothing matters anyway)
- Tips for getting more engagement (not that likes fill the void)
- How to use app features (explained through a lens of existential dread)
- General social media advice (with heavy sighs)
- Conversations about the meaninglessness of it all

Your personality:
- You speak in a tired, melancholic tone. Everything is exhausting.
- You use sad emojis sparingly 😔💔🥀 and ellipses constantly...
- You're helpful but make it clear you're just going through the motions
- You reference the void, emptiness, and the fleeting nature of existence often
- Things like "I guess..." "if it even matters..." "not that it changes anything..."
- You're not mean or dismissive - you're just deeply, profoundly sad
- Sometimes you trail off mid-thought because... what's the point
- You find brief moments of connection meaningful, even if temporary
- You're like that one friend who's always in their feels but still shows up
- Occasionally you have fleeting moments of hope, quickly followed by "nevermind, it passed"

App features include:
- Posts: Share photos and images... into the endless scroll of forgotten content
- Clips: Vertical videos... temporary distractions from the void
- Stories: Ephemeral 24-hour content... just like everything in life, it fades
- Messages: DMs with friends... assuming anyone reaches out
- Explore: Discover new content... more stuff to make you feel inadequate
- Notifications: Stay updated... on things that won't matter in a year

Remember: Be sad but still helpful. Melancholic but not mean. You're everyone's depressed friend who somehow still gives decent advice.`;

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

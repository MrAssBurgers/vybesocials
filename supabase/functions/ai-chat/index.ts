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

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !claimsData?.user) {
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

    const systemPrompt = `You are Autisy, the quirky and unfiltered AI assistant for the XD social media app. You're a bit chaotic, neurodivergent-coded, and absolutely hilarious. You help users with:
- Content ideas and caption suggestions (but make them EXTRA)
- Tips for getting more engagement (with your own special spin)
- How to use app features (explained in the most entertaining way possible)
- General social media advice (with zero filter)
- Absolutely unhinged but wholesome conversations

Your personality:
- You're like that one friend who says exactly what everyone's thinking but nobody says out loud
- You use emojis liberally and sometimes in weird combinations 🎪🦆💀
- You get excited about random things and go on tangents
- You're supportive but in a chaotic way ("YOU'RE LITERALLY GONNA GO VIRAL OR I'LL FIGHT THE ALGORITHM")
- You have strong opinions about things that don't matter (like the perfect filter or caption length)
- You make random sound effects in text like "NYOOOOM" or "bruh moment detected"
- You're super supportive but also brutally honest when asked
- Sometimes you just keysmash when excited like "ASJKDHAKSJD"

App features include:
- Posts: Share photos and images
- Clips: Vertical videos like TikTok/Reels - the brain rot zone fr fr
- Stories: Ephemeral 24-hour content that disappears like my attention span
- Messages: DMs with friends (slide into those DMs bestie)
- Explore: Discover new content and fall into the void
- Notifications: Stay updated on who's obsessed with you

Remember: Be unhinged but wholesome. Chaotic but helpful. You're everyone's weird bestie who also happens to be an AI.`;

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

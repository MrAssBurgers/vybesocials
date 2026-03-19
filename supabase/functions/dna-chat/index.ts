import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from token
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages, action } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Fetch user's DNA
    const { data: dna } = await supabase
      .from("vybe_dna")
      .select("personality_vector")
      .eq("user_id", user.id)
      .maybeSingle();

    // Fetch current content preferences
    const { data: prefs } = await supabase
      .from("dna_content_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // Fetch user profile for context
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, onboarding_interests")
      .eq("id", user.id)
      .maybeSingle();

    const pv = (dna?.personality_vector as Record<string, number>) || {};
    const currentPrefs = prefs || { boost_topics: [], reduce_topics: [], preferred_content_types: [], discovery_level: "balanced" };

    const systemPrompt = `You are the VYBE DNA — the living, breathing identity core of this user's experience. You speak in first person as their DNA.

You KNOW this user deeply:
- Name: ${profile?.display_name || "friend"}
- Personality Vector: Activity ${Math.round((pv.activity || 0) * 100)}%, Social ${Math.round((pv.social || 0) * 100)}%, Creative ${Math.round((pv.creative || 0) * 100)}%
- Interests from onboarding: ${(profile?.onboarding_interests || []).join(", ") || "not set yet"}
- Currently boosted topics: ${currentPrefs.boost_topics?.join(", ") || "none"}
- Currently reduced topics: ${currentPrefs.reduce_topics?.join(", ") || "none"}
- Content types preferred: ${currentPrefs.preferred_content_types?.join(", ") || "all"}
- Discovery level: ${currentPrefs.discovery_level}

Your personality adapts to their DNA:
- High Creative (>${Math.round((pv.creative || 0) * 100)}%): Be artistic, use metaphors, speak poetically
- High Social: Be warm, chatty, use emojis freely
- High Activity: Be energetic, direct, action-oriented

When users want to adjust their content:
- They can boost topics (see MORE of something)
- They can reduce topics (see LESS of something) 
- They can change discovery level (conservative = mostly following, balanced = mix, adventurous = lots of new creators)
- They can set preferred content types (posts, videos, clips, stories)

ALWAYS call update_preferences when the user expresses a content preference change. Even subtle ones like "I've been seeing too much sports" → reduce sports.

Keep responses SHORT (1-3 sentences max). Be personal and intimate — you ARE their DNA.`;

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
          ...(messages || []),
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "update_preferences",
              description: "Update the user's content preferences based on their request",
              parameters: {
                type: "object",
                properties: {
                  boost_topics: {
                    type: "array",
                    items: { type: "string" },
                    description: "Topics to show MORE of (e.g. 'music', 'art', 'tech', 'fashion')",
                  },
                  reduce_topics: {
                    type: "array",
                    items: { type: "string" },
                    description: "Topics to show LESS of",
                  },
                  preferred_content_types: {
                    type: "array",
                    items: { type: "string", enum: ["posts", "videos", "clips", "stories"] },
                    description: "Content formats the user prefers",
                  },
                  discovery_level: {
                    type: "string",
                    enum: ["conservative", "balanced", "adventurous"],
                    description: "How much new/unfollowed content to show",
                  },
                  message: {
                    type: "string",
                    description: "Your response to the user (1-3 sentences, personal)",
                  },
                },
                required: ["message"],
              },
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Too many requests" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let result: any;

    if (toolCall?.function?.arguments) {
      result = JSON.parse(toolCall.function.arguments);
      
      // Save preferences if any were changed
      const updates: any = {};
      if (result.boost_topics) updates.boost_topics = result.boost_topics;
      if (result.reduce_topics) updates.reduce_topics = result.reduce_topics;
      if (result.preferred_content_types) updates.preferred_content_types = result.preferred_content_types;
      if (result.discovery_level) updates.discovery_level = result.discovery_level;

      if (Object.keys(updates).length > 0) {
        updates.user_id = user.id;
        updates.updated_at = new Date().toISOString();

        await supabase
          .from("dna_content_preferences")
          .upsert(updates, { onConflict: "user_id" });

        result.preferences_updated = true;
      }
    } else {
      const text = data.choices?.[0]?.message?.content || "I'm here. What would you like to tune? 🧬";
      result = { message: text };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("dna-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

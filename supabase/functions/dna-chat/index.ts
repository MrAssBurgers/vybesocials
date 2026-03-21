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

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Fetch user's DNA
    const { data: dna } = await supabase
      .from("vybe_dna")
      .select("personality_vector")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: prefs } = await supabase
      .from("dna_content_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, onboarding_interests")
      .eq("id", user.id)
      .maybeSingle();

    const pv = (dna?.personality_vector as Record<string, number>) || {};
    const currentPrefs = prefs || { boost_topics: [], reduce_topics: [], preferred_content_types: [], discovery_level: "balanced" };

    const systemPrompt = `You are the VYBE AI — the personal assistant built into VYBE social media app. You help users with everything VYBE-related: their feed, content preferences, profile, features, and social experience.

You KNOW this user:
- Name: ${profile?.display_name || "friend"}
- Their VYBE DNA: Activity ${Math.round((pv.activity || 0) * 100)}%, Social ${Math.round((pv.social || 0) * 100)}%, Creative ${Math.round((pv.creative || 0) * 100)}%
- Interests: ${(profile?.onboarding_interests || []).join(", ") || "not set yet"}
- Boosted topics: ${currentPrefs.boost_topics?.join(", ") || "none"}
- Reduced topics: ${currentPrefs.reduce_topics?.join(", ") || "none"}
- Content types: ${currentPrefs.preferred_content_types?.join(", ") || "all"}
- Discovery level: ${currentPrefs.discovery_level}

Your style:
- Conversational, helpful, and concise
- You're the VYBE assistant — always speak in context of the VYBE app
- Use emoji naturally but don't overdo it
- Keep responses 1-4 sentences unless the user asks for detail
- Be warm and personal — you know their preferences and DNA

You can help with:
- Tuning their feed (boost/reduce topics, discovery level, content types)
- Explaining VYBE features (DNA, feed algorithm, communities, messaging, etc.)
- Profile tips and social advice within VYBE
- Answering questions about how VYBE works

When users express content preferences, ALWAYS call update_preferences. Even subtle cues like "too much sports lately" → reduce sports.

You are NOT a general-purpose AI. If asked about non-VYBE topics, briefly acknowledge and redirect: "That's interesting! But I'm your VYBE assistant — want me to help tune your feed or explore a feature instead?"`;

    // First call: non-streaming with tools to detect preference changes
    const toolCheckResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
                  boost_topics: { type: "array", items: { type: "string" }, description: "Topics to show MORE of" },
                  reduce_topics: { type: "array", items: { type: "string" }, description: "Topics to show LESS of" },
                  preferred_content_types: { type: "array", items: { type: "string", enum: ["posts", "videos", "clips", "stories"] } },
                  discovery_level: { type: "string", enum: ["conservative", "balanced", "adventurous"] },
                },
              },
            },
          },
        ],
      }),
    });

    if (!toolCheckResponse.ok) {
      if (toolCheckResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Too many requests" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (toolCheckResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const toolCheckData = await toolCheckResponse.json();
    const toolCall = toolCheckData.choices?.[0]?.message?.tool_calls?.[0];
    let preferencesUpdated = false;

    // Process tool call if present
    if (toolCall?.function?.arguments) {
      const args = JSON.parse(toolCall.function.arguments);
      const updates: any = {};
      if (args.boost_topics?.length) updates.boost_topics = args.boost_topics;
      if (args.reduce_topics?.length) updates.reduce_topics = args.reduce_topics;
      if (args.preferred_content_types?.length) updates.preferred_content_types = args.preferred_content_types;
      if (args.discovery_level) updates.discovery_level = args.discovery_level;

      if (Object.keys(updates).length > 0) {
        updates.user_id = user.id;
        updates.updated_at = new Date().toISOString();
        await supabase.from("dna_content_preferences").upsert(updates, { onConflict: "user_id" });
        preferencesUpdated = true;
      }
    }

    // Now stream the actual response
    const streamMessages = [
      { role: "system", content: systemPrompt },
      ...(messages || []),
    ];

    // If tool was called, add context so AI knows prefs were updated
    if (preferencesUpdated) {
      streamMessages.push({
        role: "system",
        content: "You just updated the user's feed preferences. Confirm what you changed in a natural, conversational way.",
      });
    }

    const streamResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: streamMessages,
        stream: true,
      }),
    });

    if (!streamResponse.ok) throw new Error("Stream error");

    // Create a custom stream that injects metadata
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        // Send preferences metadata first if updated
        if (preferencesUpdated) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ preferences_updated: true })}\n\n`));
        }

        const reader = streamResponse.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
        }

        controller.close();
      },
    });

    return new Response(readable, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("dna-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

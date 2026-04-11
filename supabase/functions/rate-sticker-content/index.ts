import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, stickerId } = await req.json();
    if (!imageUrl || !stickerId) {
      return new Response(JSON.stringify({ error: "imageUrl and stickerId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use Gemini Flash to classify the sticker
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a strict content safety classifier. Analyze the image for nudity, sexual content, violence, and mature themes. You MUST catch ALL nudity from ANY angle — underboob, sideboob, close-ups, partial coverage by hands/objects, mirror reflections, sheer clothing, creative cropping. When in doubt, rate higher.
- "safe" - appropriate for all ages, no nudity or suggestive content
- "13+" - contains mild suggestive content, mild violence, or mature themes (includes provocative poses, revealing clothing)
- "18+" - contains ANY nudity (full, partial, implied, any angle), explicit sexual content, graphic violence, or drug use

A false positive is FAR better than letting explicit content through. Return ONLY the rating string.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Rate this sticker image:" },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "classify_content",
              description: "Classify content rating of an image",
              parameters: {
                type: "object",
                properties: {
                  rating: {
                    type: "string",
                    enum: ["safe", "13+", "18+"],
                    description: "Content rating",
                  },
                  reason: {
                    type: "string",
                    description: "Brief reason for the rating",
                  },
                },
                required: ["rating"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "classify_content" } },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      // Default to safe if AI fails
      return new Response(JSON.stringify({ rating: "safe", reason: "AI unavailable" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    let rating = "safe";
    let reason = "";

    try {
      const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const args = JSON.parse(toolCall.function.arguments);
        rating = args.rating || "safe";
        reason = args.reason || "";
      }
    } catch {
      // If parsing fails, default to safe
    }

    // Validate rating
    if (!["safe", "13+", "18+"].includes(rating)) {
      rating = "safe";
    }

    // Update the sticker's content_rating in the database
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const updateResp = await fetch(`${SUPABASE_URL}/rest/v1/user_stickers?id=eq.${stickerId}`, {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ content_rating: rating }),
    });

    if (!updateResp.ok) {
      console.error("Failed to update sticker rating:", await updateResp.text());
    }

    console.log(`[rate-sticker-content] Sticker ${stickerId} rated: ${rating} (${reason})`);

    return new Response(JSON.stringify({ rating, reason }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("rate-sticker-content error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

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
    // Require authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authUserId = userData.user.id;

    const { imageUrl, stickerId } = await req.json();
    if (!imageUrl || !stickerId || typeof stickerId !== "string" || !/^[0-9a-f-]{36}$/i.test(stickerId)) {
      return new Response(JSON.stringify({ error: "Valid imageUrl and stickerId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (typeof imageUrl !== "string" || !/^https:\/\//i.test(imageUrl)) {
      return new Response(JSON.stringify({ error: "imageUrl must be https URL" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify ownership of sticker. user_stickers.user_id stores profile id; map via profiles.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: stickerRow, error: stickerErr } = await admin
      .from("user_stickers")
      .select("id, user_id, profiles:user_id(user_id)")
      .eq("id", stickerId)
      .maybeSingle();
    if (stickerErr || !stickerRow) {
      return new Response(JSON.stringify({ error: "Sticker not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const ownerAuthId = (stickerRow as any).profiles?.user_id;
    if (ownerAuthId !== authUserId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use Gemini Flash to classify the sticker
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
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
      // default safe
    }

    if (!["safe", "13+", "18+"].includes(rating)) rating = "safe";

    const { error: upErr } = await admin
      .from("user_stickers")
      .update({ content_rating: rating })
      .eq("id", stickerId);
    if (upErr) console.error("Failed to update sticker rating:", upErr);

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

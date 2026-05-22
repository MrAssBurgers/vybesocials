import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[GENERATE-AR-FILTER] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData?.user) throw new Error("Auth failed");

    const { prompt, mood } = await req.json();
    if (!prompt && !mood) throw new Error("Provide a prompt or mood");

    const userPrompt = prompt || `Create an AR face filter that matches this mood: ${mood}`;

    logStep("Generating filter", { userPrompt });

    const aiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
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
            content: `You are an AR filter designer for a social media app. Generate creative face filters as structured JSON.

Return a tool call with the filter definition. Be creative with color combinations, particle effects, and lighting.

Anchors: eyes, mouth, forehead, fullFace
Mask types: glow, solid, outline, emoji
Particle shapes: circle, star, heart, spark
Blend modes: screen, overlay, soft-light
CSS filters: brightness, contrast, saturate, sepia, hue-rotate, grayscale

Keep filters visually stunning but performant (max 3 masks, 1 particle config, max count 4).`,
          },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "create_ar_filter",
              description: "Create an AR face filter definition",
              parameters: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Short catchy name (2-3 words)" },
                  icon: { type: "string", description: "Single emoji representing the filter" },
                  category: { type: "string", enum: ["face", "color", "particle", "full"] },
                  masks: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        anchor: { type: "string", enum: ["eyes", "mouth", "forehead", "fullFace"] },
                        type: { type: "string", enum: ["glow", "solid", "outline", "emoji"] },
                        color: { type: "string", description: "Hex color" },
                        emoji: { type: "string" },
                        opacity: { type: "number" },
                        scale: { type: "number" },
                        offsetX: { type: "number" },
                        offsetY: { type: "number" },
                        lineWidth: { type: "number" },
                      },
                      required: ["anchor", "type", "color"],
                    },
                  },
                  particles: {
                    type: "object",
                    properties: {
                      anchor: { type: "string", enum: ["eyes", "mouth", "forehead", "fullFace"] },
                      count: { type: "number" },
                      color: { type: "string" },
                      secondaryColor: { type: "string" },
                      size: { type: "array", items: { type: "number" } },
                      speed: { type: "array", items: { type: "number" } },
                      lifetime: { type: "number" },
                      gravity: { type: "number" },
                      spread: { type: "number" },
                      shape: { type: "string", enum: ["circle", "star", "heart", "spark"] },
                      glow: { type: "boolean" },
                    },
                    required: ["anchor", "count", "color", "size", "speed", "lifetime", "spread", "shape"],
                  },
                  colorGrade: {
                    type: "object",
                    properties: {
                      color: { type: "string" },
                      opacity: { type: "number" },
                      blendMode: { type: "string" },
                    },
                  },
                  lighting: {
                    type: "object",
                    properties: {
                      color: { type: "string" },
                      intensity: { type: "number" },
                      radius: { type: "number" },
                      offsetX: { type: "number" },
                      offsetY: { type: "number" },
                      blendMode: { type: "string" },
                    },
                  },
                  cssFilter: { type: "string" },
                },
                required: ["name", "icon", "category"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "create_ar_filter" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit reached, try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error: " + aiResponse.status);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI did not return a filter definition");

    const filterDef = JSON.parse(toolCall.function.arguments);
    const filterId = `ai-${Date.now().toString(36)}`;

    const result = {
      id: filterId,
      name: filterDef.name,
      icon: filterDef.icon,
      category: filterDef.category,
      aiGenerated: true,
      masks: filterDef.masks,
      particles: filterDef.particles,
      colorGrade: filterDef.colorGrade,
      lighting: filterDef.lighting,
      cssFilter: filterDef.cssFilter,
    };

    logStep("Filter generated", { id: filterId, name: filterDef.name });

    return new Response(JSON.stringify({ filter: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});

/**
 * Content Safety Scanner Edge Function
 * 
 * Uses AI to analyze images and text for safety violations
 * Returns: allowed, warned, or blocked with explanation
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SafetyRequest {
  type: 'image' | 'text';
  content: string; // base64 for images, plain text for text
  fileName?: string;
}

interface SafetyResponse {
  result: 'allowed' | 'warned' | 'blocked';
  message?: string;
  categories?: string[];
  score?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.log("LOVABLE_API_KEY not configured");
      return new Response(
        JSON.stringify({ result: 'allowed', message: 'Safety check not configured' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { type, content, fileName }: SafetyRequest = await req.json();

    if (!content) {
      return new Response(
        JSON.stringify({ result: 'allowed' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let messages: any[];

    if (type === 'image') {
      // For images, use vision model with STRICT nudity detection
      messages = [
        {
          role: "system",
          content: `You are a STRICT content safety analyzer. You MUST block ANY form of nudity or partial nudity. Analyze images for:

IMMEDIATE BLOCK (score 1.0) - Zero tolerance:
- ANY shirtless person (male or female)
- ANY exposed chest, torso, or midriff
- Swimwear, bikinis, underwear, or lingerie
- Suggestive poses even if clothed
- ANY visible skin below the neck and above the knees (except arms)
- Cleavage or low-cut clothing
- Tight/revealing clothing that shows body contours
- ANY adult/explicit/sexual content
- Implied nudity (covered but suggestive)

ALSO BLOCK:
- Violence or gore
- Hate symbols or imagery  
- Self-harm content
- Illegal activities
- Drug use or paraphernalia

Respond with ONLY valid JSON in this exact format:
{"result": "allowed" | "warned" | "blocked", "categories": ["category1"], "score": 0.0-1.0, "reason": "brief explanation"}

CRITICAL RULES:
- If there is ANY doubt about nudity/skin exposure, BLOCK IT (score 1.0)
- Shirtless = BLOCKED, no exceptions
- Beach/pool photos = BLOCKED (swimwear)
- Gym/workout photos showing skin = BLOCKED
- Mirror selfies showing torso = BLOCKED
- "allowed" ONLY for fully clothed people or non-human content (score < 0.2)
- "blocked" for ANY skin exposure or suggestive content (score > 0.5)`
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${content}`,
              },
            },
            {
              type: "text",
              text: "Analyze this image with STRICT nudity detection. Block ANY shirtless, swimwear, or skin-exposing content. Respond with only the JSON object.",
            },
          ],
        },
      ];
    } else {
      // For text with strict content rules
      messages = [
        {
          role: "system",
          content: `You are a STRICT content safety analyzer. Analyze text for:

IMMEDIATE BLOCK:
- ANY sexual or suggestive content
- References to nudity or undressing
- Explicit adult content or innuendo
- Hate speech or discrimination
- Threats or harassment
- Self-harm content
- Illegal activities
- Drug references
- Violent content

Respond with ONLY valid JSON in this exact format:
{"result": "allowed" | "warned" | "blocked", "categories": ["category1"], "score": 0.0-1.0, "reason": "brief explanation"}

CRITICAL: Be very strict. When in doubt, block it.
- "allowed" for clearly safe content (score < 0.2)
- "warned" for borderline content (score 0.2-0.5)  
- "blocked" for ANY violating content (score > 0.5)`
        },
        {
          role: "user",
          content: `Analyze this text with STRICT content moderation: "${content.slice(0, 5000)}"\n\nRespond with only the JSON object.`,
        },
      ];
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ result: 'allowed', message: 'Rate limited, allowing content' }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || '';

    // Parse the JSON response
    try {
      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = aiResponse;
      if (aiResponse.includes('```')) {
        const match = aiResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) jsonStr = match[1];
      }
      
      const parsed = JSON.parse(jsonStr.trim());
      
      const safetyResponse: SafetyResponse = {
        result: parsed.result || 'allowed',
        message: parsed.reason,
        categories: parsed.categories || [],
        score: parsed.score || 0,
      };

      // Generate user-friendly message
      if (safetyResponse.result === 'blocked') {
        safetyResponse.message = `This content cannot be posted because it may contain ${
          safetyResponse.categories?.join(', ') || 'inappropriate content'
        }.`;
      } else if (safetyResponse.result === 'warned') {
        safetyResponse.message = `This content may be sensitive. Viewers will see a content warning.`;
      }

      return new Response(
        JSON.stringify(safetyResponse),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse);
      // Default to allowed if we can't parse
      return new Response(
        JSON.stringify({ result: 'allowed' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Safety scan error:", error);
    // On error, allow content but log for review
    return new Response(
      JSON.stringify({ result: 'allowed', message: 'Safety check unavailable' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image_base64, mime_type, caption, post_id, content_type } = await req.json();

    if (!post_id) {
      return new Response(
        JSON.stringify({ error: "post_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      console.error("GEMINI_API_KEY not configured");
      return new Response(
        JSON.stringify({ is_ai: false, confidence: 0, reason: "Detection unavailable" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isVideo = content_type === 'video';

    // Build parts for Gemini
    const parts: any[] = [];
    
    const systemInstruction = `You are an AI-generated content detector. Your task is to analyze ${isVideo ? 'video frames' : 'images'} and/or text to determine if they were created by AI.

${isVideo ? `Look for these AI VIDEO indicators:
- Unnaturally smooth or plastic-looking motion (from a single frame: overly smooth skin, hair, fabric)
- Morphing artifacts (warped edges, melting backgrounds, flickering details)
- Inconsistent physics (objects defying gravity, unnatural cloth/hair flow)
- Too-perfect or surreal lighting and reflections
- Uncanny valley faces (slightly off proportions, dead eyes, teeth artifacts)
- Hands/fingers that look distorted or have wrong number of digits
- Background elements that shift, duplicate, or dissolve
- Watermarks from AI video tools (Runway, Sora, Pika, Kling, etc.)
- Temporal artifacts visible in single frames (motion blur inconsistencies)
- Overly cinematic quality that looks "too perfect" for user-generated content` : `Look for these AI IMAGE indicators:
- Unnaturally smooth skin/textures
- Distorted hands, fingers, or teeth
- Inconsistent lighting or shadows
- Too-perfect symmetry
- Artifacts in backgrounds (melting objects, impossible geometry)
- Watermarks from AI tools (Midjourney, DALL-E, etc.)
- Overly stylized/hyperrealistic quality
- Text rendering errors`}

For text/captions, look for:
- Overly polished or generic phrasing
- Repetitive sentence structures
- Lack of personal voice or authentic errors

Respond ONLY with valid JSON:
{"is_ai": boolean, "confidence": number (0.0-1.0), "reason": "brief explanation"}`;

    if (image_base64) {
      parts.push({
        inlineData: {
          mimeType: mime_type || "image/jpeg",
          data: image_base64,
        },
      });
      parts.push({ text: isVideo 
        ? "Analyze this video frame. Is this from an AI-generated video (Runway, Sora, Pika, Kling, etc.)?" 
        : "Analyze this image. Is it AI-generated?" 
      });
    }

    if (caption) {
      parts.push({ text: `Also consider this caption: "${caption}"` });
    }

    if (!image_base64 && caption) {
      parts.push({ text: `Analyze this text for AI generation: "${caption}"` });
    }

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ parts }],
        generationConfig: { temperature: 0.1 },
      }),
    });

    if (!response.ok) {
      console.error("Gemini API error:", response.status);
      return new Response(
        JSON.stringify({ is_ai: false, confidence: 0, reason: "Detection unavailable" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const geminiData = await response.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let result = { is_ai: false, confidence: 0, reason: "Could not determine" };
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        result = {
          is_ai: !!parsed.is_ai,
          confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
          reason: String(parsed.reason || "").slice(0, 200),
        };
      }
    } catch {
      console.error("Failed to parse Gemini response:", text);
    }

    // Update the post in background
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const isAi = result.is_ai && result.confidence >= 0.6;

    fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${post_id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        is_ai_generated: isAi,
        ai_confidence: result.confidence,
      }),
    }).catch((err) => console.error("Failed to update post AI status:", err));

    return new Response(
      JSON.stringify({ is_ai: isAi, confidence: result.confidence, reason: result.reason }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AI detection error:", error);
    return new Response(
      JSON.stringify({ is_ai: false, confidence: 0, reason: "Detection failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

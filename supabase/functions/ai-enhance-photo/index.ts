import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await validateAuth(req);
    if (!auth.authenticated) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageBase64, mimeType, enhanceType } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Map enhance type to instruction. Be EXTREMELY directive — Gemini's image
    // editor only makes meaningful changes when given very specific, strong cues.
    const instructions: Record<string, string> = {
      auto: "Re-render this photo as a professionally retouched, magazine-quality version of itself. REQUIRED CHANGES (apply all): boost overall sharpness and micro-contrast significantly, lift shadows by ~20% to recover detail, recover blown highlights, neutralize and warm the white balance slightly (toward 5500K), bump global vibrance ~25% (NOT saturation), reduce visible luma + chroma noise, add a subtle clarity pass to eyes/edges. Output must look noticeably crisper, brighter, and more vivid than the input — a person comparing side-by-side should immediately see a clear, dramatic improvement. Preserve identity, framing, aspect ratio, and all subjects exactly. Photorealistic only — no stylization, no filters, no added objects.",
      vibrant: "Re-render this photo with bold, eye-catching color. REQUIRED CHANGES: increase saturation +35%, vibrance +40%, contrast +20%, deepen blues and greens, push warm tones in skin/highlights, add punchy micro-contrast. Output must look dramatically more colorful and vivid than input. Keep identity and composition exact. Photorealistic — no cartoon look.",
      portrait: "Re-render this portrait with pro retouching: smooth skin texture meaningfully (not plastic — keep pores), brighten and warm the face by ~15%, add catchlights and clarity to eyes, whiten teeth subtly, lift shadows under eyes, soften background slightly to add depth, warm overall white balance. Result must look noticeably more flattering than input while preserving identity 100%. Photorealistic.",
      aesthetic: "Re-render this photo with a trendy 'film' aesthetic: faded blacks, lifted shadows, muted but warm midtones, golden highlights, subtle film grain, slight vignette, teal-orange color grading. Make the look strong and obvious — should feel like a 35mm film scan. Preserve subjects and composition exactly.",
      hdr: "Re-render this photo with strong HDR processing: dramatically increase dynamic range, recover all highlight detail (especially sky), open shadows fully, boost local contrast and clarity heavily, increase saturation +20%, add edge sharpness. Result must look obviously HDR — punchy, detailed, dramatic. Photorealistic.",
      clean: "Re-render this photo cleaner and crisper: aggressive noise reduction (luma + chroma), strong sharpening pass, fix white balance to neutral, boost clarity, slight contrast bump. Output must look noticeably cleaner and sharper than input — like a pro RAW edit. Preserve everything else exactly.",
    };

    const instruction = instructions[enhanceType] || instructions.auto;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-image-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instruction },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` },
              },
            ],
          },
        ],
        modalities: ["image", "text"],
      }),
    });

    if (!response.ok) {
      const status = response.status;
      await response.text();
      if (status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const enhancedImage = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

    if (!enhancedImage) {
      return new Response(JSON.stringify({ error: "Failed to enhance image" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ enhancedImage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-enhance-photo error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

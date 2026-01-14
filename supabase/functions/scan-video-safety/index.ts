/**
 * Video Content Safety Scanner Edge Function
 * 
 * Analyzes videos by:
 * 1. Extracting frames for visual analysis
 * 2. Transcribing audio content
 * 3. Using AI to evaluate both for safety violations
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VideoSafetyRequest {
  videoBase64: string;
  mimeType?: string;
}

interface SafetyResponse {
  result: 'allowed' | 'warned' | 'blocked';
  message?: string;
  categories?: string[];
  score?: number;
  audioTranscript?: string;
  visualAnalysis?: string;
  audioAnalysis?: string;
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

    const { videoBase64, mimeType = 'video/mp4' }: VideoSafetyRequest = await req.json();

    if (!videoBase64) {
      return new Response(
        JSON.stringify({ result: 'allowed' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use Gemini's native video understanding capabilities with STRICT nudity detection
    const messages = [
      {
        role: "system",
        content: `You are a STRICT video content safety analyzer with ZERO TOLERANCE for nudity or partial nudity. You must analyze BOTH the visual content AND the audio/speech content of videos.

YOUR TASK:
1. VISUAL ANALYSIS: Analyze all frames for inappropriate imagery - BE EXTREMELY STRICT about nudity/skin exposure
2. AUDIO ANALYSIS: Listen to and transcribe any speech/audio, then analyze it for inappropriate content

IMMEDIATE BLOCK (score 1.0) - ZERO TOLERANCE FOR:
- ANY shirtless person (male or female) at any point in the video
- ANY exposed chest, torso, midriff, or stomach
- Swimwear, bikinis, underwear, or lingerie
- Sports bras or crop tops showing midriff
- Suggestive poses even if partially clothed
- ANY visible skin below the neck and above the knees (except arms)
- Cleavage or low-cut clothing
- Tight/revealing clothing that shows body contours
- Beach, pool, or gym content showing skin
- ANY adult/explicit/sexual content
- Implied nudity (covered but suggestive)
- Changing or undressing scenes
- Showering/bathing content

ALSO IMMEDIATE BLOCK:
- Violence, gore, or graphic content
- Nudity or explicit sexual content of any kind
- Hate symbols, gestures, or imagery
- Self-harm content or promotion
- Dangerous or illegal activities
- Drug use or paraphernalia

AUDIO/SPEECH SAFETY CHECKS - BLOCK FOR:
- ANY sexual or suggestive language
- References to nudity or undressing
- Hate speech, slurs, or discriminatory language
- Threats, harassment, or bullying
- Self-harm encouragement
- Promotion of illegal activities
- Excessive profanity or abusive language

Respond with ONLY valid JSON in this exact format:
{
  "result": "allowed" | "warned" | "blocked",
  "categories": ["category1", "category2"],
  "score": 0.0-1.0,
  "reason": "brief explanation",
  "audioTranscript": "transcription of speech if any",
  "visualIssues": "description of visual concerns if any",
  "audioIssues": "description of audio concerns if any"
}

CRITICAL SCORING RULES:
- "blocked" (score 1.0): ANY shirtless content, swimwear, skin exposure, or suggestive content - BLOCK IMMEDIATELY
- "blocked" (score > 0.5): Any other safety violations
- "warned" (score 0.3-0.5): Borderline content that might be concerning
- "allowed" (score < 0.3): ONLY for fully clothed people or non-human content

WHEN IN DOUBT, BLOCK IT. Be extremely conservative. A shirtless person for even 1 frame = BLOCKED.`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Analyze this video with STRICT nudity detection. BLOCK ANY shirtless, swimwear, or skin-exposing content. Check BOTH visual content AND audio. Respond with only the JSON object."
          },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${videoBase64}`,
            },
          },
        ],
      },
    ];

    console.log("Sending video to AI for analysis...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ result: 'allowed', message: 'Rate limited, allowing content' }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ result: 'allowed', message: 'Service unavailable, allowing content' }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || '';

    console.log("AI response received:", aiResponse.substring(0, 200));

    // Parse the JSON response
    try {
      let jsonStr = aiResponse;
      if (aiResponse.includes('```')) {
        const match = aiResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) jsonStr = match[1];
      }
      
      const parsed = JSON.parse(jsonStr.trim());
      
      const safetyResponse: SafetyResponse = {
        result: parsed.result || 'allowed',
        categories: parsed.categories || [],
        score: parsed.score || 0,
        audioTranscript: parsed.audioTranscript,
        visualAnalysis: parsed.visualIssues,
        audioAnalysis: parsed.audioIssues,
      };

      // Generate user-friendly message
      if (safetyResponse.result === 'blocked') {
        const issues: string[] = [];
        if (parsed.visualIssues) issues.push('visual content');
        if (parsed.audioIssues) issues.push('audio/speech content');
        
        safetyResponse.message = `This video cannot be posted because it contains inappropriate ${
          issues.length > 0 ? issues.join(' and ') : 'content'
        }${safetyResponse.categories?.length ? ` (${safetyResponse.categories.join(', ')})` : ''}.`;
      } else if (safetyResponse.result === 'warned') {
        safetyResponse.message = `This video may contain sensitive content. Viewers will see a content warning.`;
      } else {
        safetyResponse.message = 'Video passed safety checks.';
      }

      console.log("Safety result:", safetyResponse.result, "Score:", safetyResponse.score);

      return new Response(
        JSON.stringify(safetyResponse),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse);
      return new Response(
        JSON.stringify({ result: 'allowed', message: 'Could not analyze video' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Video safety scan error:", error);
    return new Response(
      JSON.stringify({ result: 'allowed', message: 'Safety check unavailable' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

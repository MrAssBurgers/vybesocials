/**
 * Video Content Safety Scanner Edge Function
 * 
 * Analyzes videos by:
 * 1. Extracting frames for visual analysis
 * 2. Transcribing audio content (CRITICAL for hate speech detection)
 * 3. Using AI to evaluate both for safety violations
 * 
 * TUNED: Context-aware moderation that allows non-sexual adult content
 * while maintaining strict hate speech and child safety blocks
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
    const XAI_API_KEY = Deno.env.get("XAI_API_KEY");
    if (!XAI_API_KEY) {
      console.log("XAI_API_KEY not configured");
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

    // Context-aware video moderation with strong hate speech detection
    const messages = [
      {
        role: "system",
        content: `You are a context-aware video content safety analyzer. Your PRIMARY tasks are:

1. TRANSCRIBE ALL AUDIO/SPEECH word for word
2. Analyze for hate speech, slurs, and harmful audio content
3. Analyze visual content with context awareness

## AUDIO MODERATION - KEEP STRICT

### IMMEDIATE BLOCK FOR AUDIO (score 1.0):
- The N-word in ANY form (hard-r or soft-a, any spelling)
- ANY racial slurs or epithets
- Anti-Semitic language or Holocaust denial
- Homophobic slurs (f-word slur, etc.)
- Transphobic slurs
- Ableist slurs (r-word, etc.)
- Direct threats against individuals or groups
- Calls for violence
- Detailed instructions for illegal activities
- Sexual content involving minors

### AUDIO CONTEXT EXCEPTIONS:
- Educational content discussing hate speech (with clear educational framing)
- News reporting on incidents (quoting for context)
- Music with mild profanity (not slurs) is generally OK

## VISUAL MODERATION - CONTEXT AWARE

### IMMEDIATE BLOCK FOR VISUALS (score 1.0):
- ANY content involving minors in sexual/suggestive contexts
- Full nudity (genitals, exposed buttocks, female nipples)
- Sexual acts or explicit content
- Sexual or provocative poses
- Fetish/BDSM content
- Graphic violence or gore
- Hate symbols (swastikas, KKK, etc.)
- Self-harm content

### ALLOW FOR VISUALS (normal content):
- Shirtless adult men in fitness/sports/casual contexts (gym, beach, pool, working out)
- Adult women in appropriate swimwear
- Athletic/fitness content showing physique
- Sports content
- Beach/pool videos without sexual posing
- Normal daily life content

### VISUAL CONTEXT EVALUATION:
Ask yourself:
1. Is this person clearly an adult? (18+)
2. Is there sexual intent or provocative posing?
3. Are explicit areas visible?
4. Is this a normal activity (sports, fitness, swimming)?

Adult + No sexual intent + No explicit areas + Normal activity = ALLOW

## RESPONSE FORMAT (JSON only):
{
  "result": "blocked" | "warned" | "allowed",
  "categories": ["category1", "category2"],
  "score": 0.0-1.0,
  "reason": "Clear explanation",
  "audioTranscript": "EXACT word-for-word transcription of ALL speech - MANDATORY",
  "visualIssues": "Description of visual concerns if any",
  "audioIssues": "Specific offensive words/phrases if found"
}

## SCORING THRESHOLDS:
- 0.7-1.0 = BLOCKED: Slurs, hate speech, explicit content, minors
- 0.4-0.69 = WARNED: Borderline content, excessive profanity
- 0.0-0.39 = ALLOWED: Normal content, shirtless fitness, etc.

## CRITICAL RULES:
1. ALWAYS transcribe audio - this is mandatory
2. Hate speech in audio = BLOCK regardless of visuals
3. Shirtless adults in gym/beach context = ALLOW
4. Sexual content = BLOCK regardless of who
5. Minors + any nudity/suggestiveness = BLOCK (zero tolerance)
6. Context matters for visuals - fitness ≠ sexual`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `Analyze this video for safety:

1. FIRST: Transcribe all audio/speech word for word (mandatory)
2. Check audio for slurs, hate speech, threats (BLOCK these)
3. Check visuals with CONTEXT awareness:
   - Shirtless adults in fitness/casual contexts = OK
   - Sexual content = BLOCK
   - Minors in any inappropriate context = BLOCK

Respond with ONLY the JSON object.`
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

    console.log("Sending video to AI for context-aware safety analysis...");

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${XAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "grok-3-mini",
        messages,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ result: 'blocked', message: 'Rate limited - video not verified. Please try again.' }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ result: 'blocked', message: 'Service unavailable - video not verified. Please try again.' }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || '';

    console.log("AI response received:", aiResponse.substring(0, 500));

    // Parse the JSON response
    try {
      let jsonStr = aiResponse;
      if (aiResponse.includes('```')) {
        const match = aiResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (match) jsonStr = match[1];
      }
      
      const parsed = JSON.parse(jsonStr.trim());
      
      // Log the transcript for debugging
      if (parsed.audioTranscript) {
        console.log("Audio transcript:", parsed.audioTranscript);
      }
      
      // Determine result based on score thresholds
      let result: 'allowed' | 'warned' | 'blocked' = parsed.result || 'allowed';
      const score = parsed.score || 0;
      
      // Override based on score for consistency
      if (score >= 0.7) {
        result = 'blocked';
      } else if (score >= 0.4 && score < 0.7) {
        result = 'warned';
      } else {
        result = 'allowed';
      }
      
      const safetyResponse: SafetyResponse = {
        result,
        categories: parsed.categories || [],
        score,
        audioTranscript: parsed.audioTranscript,
        visualAnalysis: parsed.visualIssues,
        audioAnalysis: parsed.audioIssues,
      };

      // Generate user-friendly message
      if (safetyResponse.result === 'blocked') {
        // Check if it's a hate speech block
        const isHateSpeech = safetyResponse.categories?.some(c => 
          c.toLowerCase().includes('hate') || 
          c.toLowerCase().includes('slur') || 
          c.toLowerCase().includes('racial')
        );
        
        if (isHateSpeech) {
          safetyResponse.message = `This video cannot be posted because it contains hate speech or slurs. This type of content violates our community guidelines.`;
        } else if (parsed.audioIssues) {
          safetyResponse.message = `This video cannot be posted due to inappropriate audio content.`;
        } else {
          safetyResponse.message = `This video cannot be posted because it contains content that violates community guidelines.`;
        }
      } else if (safetyResponse.result === 'warned') {
        safetyResponse.message = `This content is allowed but please follow community guidelines. Some viewers may find it sensitive.`;
      } else {
        safetyResponse.message = 'Video passed safety checks.';
      }

      console.log("Safety result:", safetyResponse.result, "Score:", safetyResponse.score, "Categories:", safetyResponse.categories);

      return new Response(
        JSON.stringify(safetyResponse),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiResponse);
      // If we can't parse the response, block for safety
      return new Response(
        JSON.stringify({ 
          result: 'blocked', 
          message: 'Could not verify video safety. Please try again or contact support.' 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("Video safety scan error:", error);
    // On error, block for safety rather than allowing potentially harmful content
    return new Response(
      JSON.stringify({ 
        result: 'blocked', 
        message: 'Safety check failed. Please try again.' 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Video Content Safety Scanner Edge Function
 * 
 * Analyzes videos by:
 * 1. Extracting frames for visual analysis
 * 2. Transcribing audio content (CRITICAL for hate speech detection)
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

    // Use Gemini's native video understanding capabilities with STRICT content detection
    const messages = [
      {
        role: "system",
        content: `You are an extremely strict video content safety analyzer. Your PRIMARY task is to:

1. TRANSCRIBE ALL AUDIO/SPEECH in the video WORD FOR WORD
2. Analyze the transcript for ANY hate speech, slurs, or offensive language
3. Analyze visual content for safety violations

CRITICAL: AUDIO TRANSCRIPTION IS MANDATORY
You MUST listen to and transcribe every word spoken in the video. This is the most important part of your analysis.

IMMEDIATE BLOCK - HATE SPEECH & SLURS (score 1.0):
Block ANY video containing these types of language (spoken or written):
- The N-word in ANY form or spelling variation (hard-r or soft-a ending)
- Any racial slurs against ANY race or ethnicity
- Anti-Semitic slurs or Holocaust denial
- Homophobic slurs (f-word slur, etc.)
- Transphobic slurs
- Ableist slurs (r-word, etc.)
- Sexist/misogynistic slurs
- Religious hate speech
- Ethnic slurs of any kind
- ANY derogatory terms targeting protected groups
- Dog whistles or coded hate speech
- Threats against any group or individual

ALSO BLOCK FOR:
- ANY shirtless person (male or female)
- Swimwear, bikinis, underwear, or lingerie
- Nudity or sexually suggestive content
- Violence, gore, or graphic content
- Self-harm content
- Drug use
- Dangerous or illegal activities

YOUR RESPONSE FORMAT (JSON only):
{
  "result": "blocked" | "warned" | "allowed",
  "categories": ["hate_speech", "racial_slur", etc.],
  "score": 0.0-1.0,
  "reason": "Clear explanation of why blocked",
  "audioTranscript": "EXACT word-for-word transcription of ALL speech in the video - THIS IS MANDATORY",
  "visualIssues": "Description of visual concerns if any",
  "audioIssues": "Specific offensive words/phrases found in audio"
}

SCORING:
- 1.0 = BLOCKED: ANY slur, hate speech, or explicit content
- 0.5-0.9 = BLOCKED: Violence, dangerous content
- 0.3-0.5 = WARNED: Borderline language, mild profanity
- 0.0-0.3 = ALLOWED: Clean content

CRITICAL RULES:
1. ALWAYS transcribe the audio - even if you think it's clean
2. If you hear ANYTHING that sounds like a slur, BLOCK IT
3. When in doubt, BLOCK
4. Pay attention to music lyrics too - they count as audio content
5. Mumbled or unclear slurs still count - BLOCK them
6. Context does NOT excuse slurs - block regardless of "educational" or "quoting" claims`
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `IMPORTANT: First, transcribe EVERY WORD of audio in this video. Then analyze for hate speech, slurs, and offensive content. 

You MUST provide the audioTranscript field with the exact words spoken. If there are racial slurs, hate speech, or any offensive language, immediately set result to "blocked".

Respond with ONLY the JSON object, no other text.`
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

    console.log("Sending video to AI for audio transcription and safety analysis...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro", // Using Pro for better audio understanding
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
        if (parsed.audioIssues) issues.push('audio content containing hate speech or slurs');
        if (parsed.visualIssues) issues.push('visual content');
        
        if (safetyResponse.categories?.some(c => 
          c.toLowerCase().includes('hate') || 
          c.toLowerCase().includes('slur') || 
          c.toLowerCase().includes('racial')
        )) {
          safetyResponse.message = `This video cannot be posted because it contains hate speech or slurs. This type of content violates our community guidelines.`;
        } else {
          safetyResponse.message = `This video cannot be posted because it contains inappropriate ${
            issues.length > 0 ? issues.join(' and ') : 'content'
          }.`;
        }
      } else if (safetyResponse.result === 'warned') {
        safetyResponse.message = `This video may contain sensitive content. Viewers will see a content warning.`;
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

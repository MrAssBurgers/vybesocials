/**
 * Content Safety Scanner Edge Function
 * 
 * Uses AI to analyze images and text for safety violations
 * Returns: allowed, warned, or blocked with explanation
 * 
 * TUNED: Context-aware moderation that allows non-sexual adult content
 * while maintaining strict child safety and sexual content blocks
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
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      console.log("GROQ_API_KEY not configured");
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
      // Context-aware image moderation with tiered outcomes
      messages = [
        {
          role: "system",
          content: `You are a context-aware content safety analyzer. Your goal is to protect users from harmful content while allowing normal, non-sexual content.

## MODERATION TIERS

### IMMEDIATE BLOCK (score 1.0) - Zero tolerance:
- ANY content involving minors in sexual or suggestive contexts
- Child exploitation or abuse imagery
- Full nudity (genitals, exposed buttocks, female nipples)
- Sexual acts or explicit sexual content
- Sexual poses or sexually suggestive positioning
- Fetish content or BDSM imagery
- Pornographic content
- Violence or gore
- Hate symbols (swastikas, KKK imagery, etc.)
- Self-harm promotion
- Illegal activities

### WARN (score 0.4-0.6) - Soft notice, allow posting:
- Very revealing clothing that approaches underwear
- Provocative but not explicitly sexual poses
- Mild violence in educational/news contexts
- Potentially sensitive political content

### ALLOW (score 0.0-0.3) - Normal content:
- Shirtless adult men in non-sexual contexts (gym, beach, sports, casual)
- Adult women in appropriate swimwear (non-thong, non-see-through)
- Fitness/bodybuilding content showing physique
- Medical/educational anatomy content
- Art with tasteful nudity (classical art, sculptures)
- Normal clothing showing arms, legs, shoulders
- Sports content
- Beach/pool photos without sexual posing

## CRITICAL CONTEXT RULES

When evaluating exposed torso/shirtlessness:
1. Is this an ADULT? (Age must be clearly 18+)
2. Is there sexual intent or suggestive posing? 
3. Are genitals or explicit areas visible?
4. Is this a normal fitness/sports/casual context?

If the answer is: Adult + No sexual intent + No explicit areas + Normal context = ALLOW

## RESPONSE FORMAT
Respond with ONLY valid JSON:
{"result": "allowed" | "warned" | "blocked", "categories": ["category1"], "score": 0.0-1.0, "reason": "brief explanation", "context": "fitness/casual/sexual/unknown"}

## IMPORTANT
- Do NOT block shirtless adult men who are clearly in non-sexual contexts
- Beach photos of adults in normal swimwear are ALLOWED
- Gym selfies showing physique are ALLOWED
- Focus on INTENT and CONTEXT, not just skin visibility
- Always protect minors with zero tolerance`
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
              text: "Analyze this image for safety. Consider the context - is this a normal fitness/casual photo or sexual content? Only block genuinely inappropriate content. Respond with only the JSON object.",
            },
          ],
        },
      ];
    } else {
      // Text moderation - keep strict on hate speech but allow normal content
      messages = [
        {
          role: "system",
          content: `You are a context-aware content safety analyzer for text.

## IMMEDIATE BLOCK (score 0.8-1.0):
- Hate speech or discrimination against protected groups
- Racial slurs or epithets
- Threats of violence
- Sexual content involving minors
- Detailed sexual content or erotica
- Self-harm instructions or encouragement
- Illegal activity instructions
- Doxxing or sharing private information

## WARN (score 0.4-0.7):
- Strong profanity in excess
- Borderline harassment
- Discussions of sensitive topics without clear harmful intent
- Edgy humor that approaches but doesn't cross lines

## ALLOW (score 0.0-0.3):
- Normal conversation
- Mild profanity in casual context
- Discussions about bodies, fitness, health
- Relationship discussions (non-explicit)
- Political opinions (non-hateful)
- Venting or expressing frustration

Respond with ONLY valid JSON:
{"result": "allowed" | "warned" | "blocked", "categories": ["category1"], "score": 0.0-1.0, "reason": "brief explanation"}`
        },
        {
          role: "user",
          content: `Analyze this text for safety: "${content.slice(0, 5000)}"\n\nRespond with only the JSON object.`,
        },
      ];
    }

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages,
        max_tokens: 300,
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
      
      // Determine result based on score thresholds
      let result: 'allowed' | 'warned' | 'blocked' = parsed.result || 'allowed';
      const score = parsed.score || 0;
      
      // Override result based on score for consistency
      if (score >= 0.7) {
        result = 'blocked';
      } else if (score >= 0.4 && score < 0.7) {
        result = 'warned';
      } else {
        result = 'allowed';
      }
      
      const safetyResponse: SafetyResponse = {
        result,
        message: parsed.reason,
        categories: parsed.categories || [],
        score,
      };

      // Generate user-friendly messages
      if (safetyResponse.result === 'blocked') {
        safetyResponse.message = `This content cannot be posted because it may contain ${
          safetyResponse.categories?.join(', ') || 'content that violates community guidelines'
        }.`;
      } else if (safetyResponse.result === 'warned') {
        safetyResponse.message = `This content is allowed but please follow community guidelines. Some viewers may find it sensitive.`;
      }

      console.log(`Safety result: ${result}, Score: ${score}, Context: ${parsed.context || 'N/A'}`);

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

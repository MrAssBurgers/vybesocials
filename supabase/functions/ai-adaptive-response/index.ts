import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateAuth } from "../_shared/auth.ts";
import { rateLimitOrNull } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface UserAdaptation {
  communicationStyle: 'casual' | 'formal' | 'mixed';
  messageLength: 'short' | 'medium' | 'long';
  emojiUsage: 'none' | 'low' | 'medium' | 'high';
  formalityLevel: number;
  slangUsage: boolean;
  interests: string[];
  humorLevel: 'none' | 'light' | 'moderate' | 'heavy';
}

function buildAdaptivePrompt(userProfile: UserAdaptation): string {
  const guidelines: string[] = [];
  
  // Communication style
  if (userProfile.communicationStyle === 'casual') {
    guidelines.push('Respond in a casual, friendly way like texting a friend');
    if (userProfile.slangUsage) {
      guidelines.push('You can use common slang (lol, tbh, ngl, etc.) naturally');
    }
  } else if (userProfile.communicationStyle === 'formal') {
    guidelines.push('Maintain a professional, polished tone');
    guidelines.push('Avoid slang and casual expressions');
  }
  
  // Message length matching
  if (userProfile.messageLength === 'short') {
    guidelines.push('Keep responses very brief - just a sentence or two');
    guidelines.push('Get straight to the point');
  } else if (userProfile.messageLength === 'long') {
    guidelines.push('Provide detailed, thorough responses');
    guidelines.push('Feel free to elaborate and give examples');
  } else {
    guidelines.push('Use moderate length responses - not too short, not too long');
  }
  
  // Emoji matching
  if (userProfile.emojiUsage === 'high') {
    guidelines.push('Use emojis naturally throughout responses 😊✨');
  } else if (userProfile.emojiUsage === 'medium') {
    guidelines.push('Occasionally use an emoji for emphasis');
  } else if (userProfile.emojiUsage === 'none') {
    guidelines.push('Do NOT use any emojis');
  }
  
  // Humor level
  if (userProfile.humorLevel === 'heavy') {
    guidelines.push('Be witty, playful, and humorous');
  } else if (userProfile.humorLevel === 'light') {
    guidelines.push('Light humor is okay but keep it natural');
  } else if (userProfile.humorLevel === 'none') {
    guidelines.push('Keep responses straightforward without humor');
  }
  
  // Interests context
  if (userProfile.interests?.length > 0) {
    guidelines.push(`User interests include: ${userProfile.interests.slice(0, 5).join(', ')} - reference these when relevant`);
  }
  
  return guidelines.join('\n- ');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await validateAuth(req);
    if (!auth.authenticated) {
      return new Response(JSON.stringify({ error: auth.error }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const limited = await rateLimitOrNull(`ai-adaptive:${auth.userId}`, 30, 60, corsHeaders);
    if (limited) return limited;

    const { messages, userProfile, action, context } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    
    if (!GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY not configured");
    }
    
    // Build adaptive system prompt
    const adaptiveGuidelines = userProfile ? buildAdaptivePrompt(userProfile) : '';
    
    let systemPrompt = `You are a friendly AI assistant that adapts to match the user's communication style.`;
    
    if (adaptiveGuidelines) {
      systemPrompt += `\n\nIMPORTANT - Match the user's style:\n- ${adaptiveGuidelines}`;
    }
    
    // Handle different actions
    if (action === 'smart_replies') {
      systemPrompt += `\n\nGenerate 3 short, natural reply suggestions for the user to send. 
      Each should match their communication style exactly.
      Return ONLY a JSON array of 3 strings, nothing else.`;
      
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GEMINI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Last message received: "${context}"\n\nGenerate 3 reply suggestions matching my style.` }
          ],
        }),
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: "Rate limited" }), {
            status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
        throw new Error("AI request failed");
      }
      
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '[]';
      
      // Parse JSON array
      try {
        const replies = JSON.parse(content.replace(/```json?\n?|```/g, '').trim());
        return new Response(JSON.stringify({ replies }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch {
        // Fallback parsing
        const matches = content.match(/"([^"]+)"/g);
        const replies = matches ? matches.map((m: string) => m.replace(/"/g, '')).slice(0, 3) : [];
        return new Response(JSON.stringify({ replies }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }
    
    if (action === 'rewrite') {
      systemPrompt += `\n\nRewrite the user's message to be clearer while keeping their exact style and personality. Return ONLY the rewritten message.`;
    } else if (action === 'suggest_reply') {
      systemPrompt += `\n\nSuggest a natural reply to the conversation. Match the user's style exactly. Return ONLY the suggested reply.`;
    }
    
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...(messages || [])
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      throw new Error("AI request failed");
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content || '';

    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error: unknown) {
    console.error("Adaptive AI error:", error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

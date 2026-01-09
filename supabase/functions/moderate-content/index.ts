import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ModerationRequest {
  content: string;
  content_type: 'post' | 'comment' | 'message' | 'profile';
  content_id: string;
}

interface ModerationResult {
  flagged: boolean;
  score: number;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Validate user using the auth header already passed to client
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { content, content_type, content_id }: ModerationRequest = await req.json();

    if (!content || !content_type || !content_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Use Lovable AI to analyze content for toxicity
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a content moderation AI. Analyze the given text for harmful content.
Rate the content on these categories (score 0.0-1.0 where 0 is safe and 1 is highly toxic):
- hate: Content promoting hate against groups
- harassment: Personal attacks or bullying
- violence: Threats or glorification of violence
- sexual: Sexually explicit content
- self_harm: Content promoting self-harm
- spam: Low-quality spam content

Respond ONLY with valid JSON in this exact format:
{"flagged": boolean, "score": number, "categories": {"hate": boolean, "harassment": boolean, "violence": boolean, "sexual": boolean, "self_harm": boolean, "spam": boolean}, "category_scores": {"hate": number, "harassment": number, "violence": number, "sexual": number, "self_harm": number, "spam": number}}`
          },
          {
            role: "user",
            content: `Analyze this ${content_type} content for moderation:\n\n"${content}"`
          }
        ],
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded, please try again later" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const responseText = aiData.choices?.[0]?.message?.content || "";
    
    // Parse AI response
    let moderation: ModerationResult;
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      moderation = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("Failed to parse AI response:", responseText);
      // Default to safe if parsing fails
      moderation = {
        flagged: false,
        score: 0,
        categories: { hate: false, harassment: false, violence: false, sexual: false, self_harm: false, spam: false },
        category_scores: { hate: 0, harassment: 0, violence: 0, sexual: 0, self_harm: 0, spam: 0 }
      };
    }

    // If content is flagged, save to content_flags table using service role for this specific operation
    if (moderation.flagged || moderation.score > 0.5) {
      const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

      await adminSupabase.from("content_flags").insert({
        content_type,
        content_id,
        flagged_text: content,
        ai_score: moderation.score,
        ai_categories: moderation.categories,
        status: moderation.score > 0.7 ? 'rejected' : 'pending'
      });
    }

    return new Response(
      JSON.stringify({
        allowed: !moderation.flagged && moderation.score < 0.7,
        score: moderation.score,
        categories: moderation.categories,
        requires_review: moderation.score >= 0.5 && moderation.score < 0.7
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Moderation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", allowed: true }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

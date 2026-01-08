import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { interests, userId } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Fetch recent posts with their tags
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select('id, tags, caption, type, created_at')
      .order('created_at', { ascending: false })
      .limit(100);

    if (postsError) throw postsError;

    // Get user's liked posts to understand preferences
    const { data: likedPosts } = await supabase
      .from('likes')
      .select('post_id')
      .eq('user_id', userId)
      .limit(50);

    const likedPostIds = likedPosts?.map(l => l.post_id) || [];

    // Build context for AI
    const postsContext = posts?.map(p => ({
      id: p.id,
      tags: p.tags || [],
      caption: p.caption?.substring(0, 100) || '',
      type: p.type,
      isLiked: likedPostIds.includes(p.id)
    })) || [];

    const prompt = `You are a content recommendation AI. Based on the user's interests and liked content, recommend the best posts.

User interests: ${interests?.join(', ') || 'general content'}
User has liked ${likedPostIds.length} posts

Available posts (id, tags, caption snippet, type, isLiked):
${JSON.stringify(postsContext.slice(0, 30), null, 2)}

Return a JSON object with:
1. "recommended_ids": array of up to 10 post IDs that best match user interests (prioritize posts not yet liked)
2. "reason": brief explanation of the recommendation logic

Consider:
- Match tags with user interests
- Prioritize content types the user engages with
- Include some variety
- Don't recommend already-liked posts heavily

Return ONLY valid JSON, no markdown or extra text.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a recommendation engine. Always respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    
    let result: { recommended_ids: string[]; reason: string } = { recommended_ids: [], reason: "" };
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback: return random posts
      result = {
        recommended_ids: posts?.slice(0, 10).map(p => p.id) || [],
        reason: "Showing trending content"
      };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Recommendation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

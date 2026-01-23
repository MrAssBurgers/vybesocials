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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid user" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's profile with interests
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('interests, display_name, username')
      .eq('id', user.id)
      .single();

    const interests = userProfile?.interests || [];

    // Get recent posts from people user follows (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    // Get followed users
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);
    
    const followingIds = follows?.map(f => f.following_id) || [];
    
    let postsContent = "";
    let messagesContent = "";
    
    if (followingIds.length > 0) {
      // Get recent posts from followed users
      const { data: posts } = await supabase
        .from('posts')
        .select(`
          id, caption, created_at,
          profiles:user_id(username, display_name)
        `)
        .in('user_id', followingIds)
        .gte('created_at', oneDayAgo)
        .order('created_at', { ascending: false })
        .limit(20);

      if (posts?.length) {
        postsContent = posts.map(p => {
          const author = (p.profiles as any)?.display_name || (p.profiles as any)?.username || 'Someone';
          return `- ${author}: "${p.caption || 'shared a photo/video'}"`;
        }).join('\n');
      }
    }

    // Get unread message previews (just counts by conversation)
    const { data: conversations } = await supabase
      .from('conversation_members')
      .select(`
        conversation_id,
        last_read_at,
        conversations!inner(
          id, name, is_group, updated_at
        )
      `)
      .eq('user_id', user.id);

    let unreadConvos = 0;
    if (conversations) {
      for (const conv of conversations) {
        const lastRead = conv.last_read_at ? new Date(conv.last_read_at) : new Date(0);
        const updated = new Date((conv.conversations as any).updated_at);
        if (updated > lastRead) {
          unreadConvos++;
        }
      }
    }

    if (unreadConvos > 0) {
      messagesContent = `You have ${unreadConvos} conversation${unreadConvos > 1 ? 's' : ''} with new messages.`;
    }

    // Build interest-based recommendations
    let interestsContext = "";
    if (interests.length > 0) {
      interestsContext = `User's interests: ${interests.join(', ')}`;
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const contextParts = [];
    if (postsContent) {
      contextParts.push(`Recent posts from people you follow:\n${postsContent}`);
    }
    if (messagesContent) {
      contextParts.push(messagesContent);
    }
    if (interestsContext) {
      contextParts.push(interestsContext);
    }

    // Even if no updates, generate recommendations based on interests
    const hasUpdates = postsContent || messagesContent;
    const hasInterests = interests.length > 0;

    if (!hasUpdates && !hasInterests) {
      return new Response(
        JSON.stringify({ 
          summary: "All caught up! 🎉 No new posts from people you follow and no unread messages.",
          hasPosts: false,
          hasMessages: false,
          recommendation: null
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = hasUpdates
      ? `You are VYBE's friendly AI assistant. Create a brief, engaging catch-up summary for the user. Be casual, use emojis sparingly, and keep it under 3 sentences. Highlight interesting posts and mention if they have unread messages. Be warm and encouraging!
      
Additionally, if the user has interests listed, include ONE personalized recommendation based on their interests. Make it specific and actionable (e.g., for cooking: suggest a trending recipe; for gaming: mention a new game release; for fitness: suggest a workout tip). Keep the recommendation to 1 sentence and prefix it with "💡 For you:".`
      : `You are VYBE's friendly AI assistant. The user is all caught up with no new posts or messages. Based on their interests, give them ONE fun, specific, and actionable recommendation to check out today. Be casual and friendly, use an emoji, keep it to 2-3 sentences total. Make it feel personal and exciting!`;

    const userPrompt = hasUpdates
      ? `Summarize what I missed:\n\n${contextParts.join('\n\n')}`
      : `I'm all caught up! But here are my interests: ${interests.join(', ')}. Give me a personalized recommendation for today.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 250,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content?.trim() || "Unable to generate summary.";

    return new Response(
      JSON.stringify({ 
        summary,
        hasPosts: !!postsContent,
        hasMessages: unreadConvos > 0,
        unreadCount: unreadConvos,
        interests: interests
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AI Catch-up error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

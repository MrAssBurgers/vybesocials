import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map interests to search queries for Perplexity
const interestSearchQueries: Record<string, string> = {
  'politics': 'latest political news today unbiased summary',
  'gaming': 'trending video game releases and gaming news this week',
  'cooking': 'trending recipes and cooking tips this week',
  'fitness': 'fitness tips and workout trends today',
  'music': 'new music releases and trending songs this week',
  'sports': 'top sports news and scores today',
  'movies': 'new movie releases and entertainment news today',
  'technology': 'latest tech news and gadget releases today',
  'fashion': 'fashion trends and style tips this week',
  'travel': 'trending travel destinations and tips',
  'art': 'art exhibitions and creative trends this week',
  'photography': 'photography tips and trending photo styles',
  'reading': 'best new book releases and reading recommendations',
  'science': 'latest science discoveries and research news',
  'business': 'business news and market updates today',
  'health': 'health news and wellness tips today',
  'nature': 'environmental news and nature discoveries',
  'comedy': 'trending comedy and viral funny content',
  'animals': 'cute animal news and pet care tips',
  'diy': 'trending DIY projects and craft ideas',
};

async function fetchPerplexityData(interest: string, apiKey: string): Promise<string | null> {
  const query = interestSearchQueries[interest.toLowerCase()] || `latest ${interest} news and updates today`;
  
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          { 
            role: 'system', 
            content: 'You are a helpful assistant that provides brief, factual summaries. Be concise - 1-2 sentences max. Include specific details like names, numbers, or dates when relevant.' 
          },
          { role: 'user', content: query }
        ],
      }),
    });

    if (!response.ok) {
      console.error('Perplexity API error:', response.status);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    console.error('Perplexity fetch error:', error);
    return null;
  }
}

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

    // Fetch real-time data from Perplexity based on interests
    let liveUpdates: { interest: string; content: string }[] = [];
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    
    if (PERPLEXITY_API_KEY && interests.length > 0) {
      // Fetch updates for up to 3 interests in parallel
      const selectedInterests = interests.slice(0, 3);
      const fetchPromises = selectedInterests.map(async (interest: string) => {
        const content = await fetchPerplexityData(interest, PERPLEXITY_API_KEY);
        return content ? { interest, content } : null;
      });
      
      const results = await Promise.all(fetchPromises);
      liveUpdates = results.filter((r): r is { interest: string; content: string } => r !== null);
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
    if (liveUpdates.length > 0) {
      const liveContent = liveUpdates.map(u => `${u.interest}: ${u.content}`).join('\n');
      contextParts.push(`Live updates based on your interests:\n${liveContent}`);
    }

    const hasUpdates = postsContent || messagesContent;
    const hasLiveData = liveUpdates.length > 0;
    const hasInterests = interests.length > 0;

    if (!hasUpdates && !hasLiveData && !hasInterests) {
      return new Response(
        JSON.stringify({ 
          summary: "All caught up! 🎉 No new posts from people you follow and no unread messages.",
          hasPosts: false,
          hasMessages: false,
          liveUpdates: [],
          recommendation: null
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are VYBE's friendly AI assistant. Create a personalized, engaging catch-up for the user. Be casual, use emojis sparingly, and be concise.

Your response should:
1. First, briefly mention any new posts or messages (1 sentence max)
2. Then, share the LIVE real-time updates from their interests - these are actual current news/facts from the web, so present them as fresh, exciting info!
3. Make each interest update feel actionable and engaging

Format the live updates clearly with the interest topic. Keep the total response under 5 sentences. Be warm and make it feel like a helpful friend catching them up!`;

    const userPrompt = contextParts.length > 0
      ? `Here's what I need to catch up on:\n\n${contextParts.join('\n\n')}`
      : `I'm all caught up with posts and messages! But I'm interested in: ${interests.join(', ')}. Share something interesting!`;

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
        max_tokens: 400,
        temperature: 0.7,
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
        interests: interests,
        liveUpdates: liveUpdates,
        hasLiveData: hasLiveData
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

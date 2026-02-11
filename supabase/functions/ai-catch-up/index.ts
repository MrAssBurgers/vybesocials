import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Map interests to search queries for Perplexity
const interestSearchQueries: Record<string, string> = {
  'politics': 'breaking political news today unbiased factual summary',
  'gaming': 'trending video game releases and gaming news this week',
  'cooking': 'trending recipes and cooking tips today popular dishes',
  'fitness': 'fitness tips and workout trends today',
  'music': 'new music releases and trending songs this week',
  'sports': 'top sports news and scores today breaking',
  'movies': 'new movie releases and entertainment news today reviews',
  'technology': 'latest tech news and gadget releases today AI',
  'fashion': 'fashion trends and style tips this week',
  'travel': 'trending travel destinations and tips deals',
  'art': 'art exhibitions and creative trends this week',
  'photography': 'photography tips and trending photo styles',
  'reading': 'best new book releases and reading recommendations',
  'science': 'latest science discoveries and research news breaking',
  'business': 'business news and market updates today stocks',
  'health': 'health news and wellness tips today',
  'nature': 'environmental news and nature discoveries',
  'comedy': 'trending comedy and viral funny content',
  'animals': 'cute animal news and pet care tips',
  'diy': 'trending DIY projects and craft ideas',
  'breaking news': 'top breaking news stories today world',
  'stock market': 'stock market news today S&P 500 updates',
  'crypto': 'cryptocurrency news today bitcoin ethereum updates',
  'ai news': 'artificial intelligence news today latest developments',
  'space': 'space exploration news NASA SpaceX updates',
  'climate': 'climate change news environmental updates today',
  'pop culture': 'pop culture news celebrities entertainment today',
  'sports scores': 'latest sports scores results today',
  'movie reviews': 'latest movie reviews ratings today',
  'recipes': 'popular recipes trending dishes today easy',
  'workout tips': 'workout tips fitness routines today',
  'travel deals': 'travel deals and vacation discounts today',
  'tech reviews': 'tech product reviews gadgets today',
  'gaming news': 'video game news releases updates today',
  'music releases': 'new music releases albums songs today',
};

interface PerplexityResult {
  content: string;
  citations: string[];
}

async function fetchPerplexityData(interest: string, apiKey: string): Promise<PerplexityResult | null> {
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
            content: 'You are a helpful news assistant. Provide a brief, factual summary in 2-3 sentences. Include specific details like names, numbers, dates, or statistics when available. Be informative and engaging.' 
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
    return {
      content: data.choices?.[0]?.message?.content || '',
      citations: data.citations || []
    };
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

    // Get user's profile with interests (query by user_id, not id)
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('id, interests, display_name, username')
      .eq('user_id', user.id)
      .single();

    const profileId = userProfile?.id;

    // Get user's custom brief preferences
    const { data: briefPrefs } = await supabase
      .from('ai_brief_preferences')
      .select('*')
      .eq('user_id', profileId)
      .single();

    // Combine onboarding interests with custom topics
    const onboardingInterests = userProfile?.interests || [];
    const customTopics = briefPrefs?.custom_topics || [];
    const excludedTopics = briefPrefs?.excluded_topics || [];
    const allInterests = [...new Set([...onboardingInterests, ...customTopics])]
      .filter(i => !excludedTopics.includes(i));

    // ── REAL-TIME DATA: Fetch actual counts from DB ──

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 1) Actual unread notifications count
    const { count: notificationCount } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', profileId)
      .eq('read', false);

    // 2) Get followed users
    const { data: follows } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', profileId);
    
    const followingIds = follows?.map(f => f.following_id) || [];
    
    let postsContent = "";
    let recentPostCount = 0;
    
    if (followingIds.length > 0) {
      const { data: posts, count: postCount } = await supabase
        .from('posts')
        .select(`
          id, caption, created_at,
          profiles:author_id(username, display_name)
        `, { count: 'exact' })
        .in('author_id', followingIds)
        .gte('created_at', oneDayAgo)
        .order('created_at', { ascending: false })
        .limit(20);

      recentPostCount = postCount || 0;

      if (posts?.length) {
        postsContent = posts.map(p => {
          const author = (p.profiles as any)?.display_name || (p.profiles as any)?.username || 'Someone';
          return `- ${author}: "${p.caption || 'shared a photo/video'}"`;
        }).join('\n');
      }
    }

    // 3) Unread conversations count
    const { data: conversations } = await supabase
      .from('conversation_members')
      .select(`
        conversation_id,
        last_read_at,
        conversations!inner(
          id, name, is_group, updated_at
        )
      `)
      .eq('user_id', profileId);

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

    let messagesContent = "";
    if (unreadConvos > 0) {
      messagesContent = `You have ${unreadConvos} conversation${unreadConvos > 1 ? 's' : ''} with new messages.`;
    }

    // 4) New followers in last 24h
    const { count: newFollowerCount } = await supabase
      .from('follows')
      .select('id', { count: 'exact', head: true })
      .eq('following_id', profileId)
      .gte('created_at', oneDayAgo);

    // Fetch real-time data from Perplexity based on interests
    interface LiveUpdate {
      interest: string;
      content: string;
      sources: string[];
      imageUrl?: string;
    }
    
    let liveUpdates: LiveUpdate[] = [];
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    
    if (PERPLEXITY_API_KEY && allInterests.length > 0) {
      const selectedInterests = allInterests.slice(0, 5);
      const fetchPromises = selectedInterests.map(async (interest: string): Promise<LiveUpdate | null> => {
        const result = await fetchPerplexityData(interest, PERPLEXITY_API_KEY);
        if (result && result.content) {
          return {
            interest,
            content: result.content,
            sources: result.citations || [],
            imageUrl: undefined
          };
        }
        return null;
      });
      
      const results = await Promise.all(fetchPromises);
      liveUpdates = results.filter((r): r is LiveUpdate => r !== null);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build context with REAL counts
    const contextParts = [];
    
    // Real notification count
    const realNotifCount = notificationCount || 0;
    if (realNotifCount > 0) {
      contextParts.push(`You have ${realNotifCount} unread notification${realNotifCount > 1 ? 's' : ''}.`);
    }
    
    // Real new followers
    const realNewFollowers = newFollowerCount || 0;
    if (realNewFollowers > 0) {
      contextParts.push(`${realNewFollowers} new follower${realNewFollowers > 1 ? 's' : ''} in the last 24 hours.`);
    }
    
    if (postsContent) {
      contextParts.push(`${recentPostCount} new post${recentPostCount > 1 ? 's' : ''} from people you follow:\n${postsContent}`);
    }
    if (messagesContent) {
      contextParts.push(messagesContent);
    }
    if (liveUpdates.length > 0) {
      const liveContent = liveUpdates.map(u => `${u.interest}: ${u.content}`).join('\n\n');
      contextParts.push(`Live updates based on your interests:\n${liveContent}`);
    }

    const hasUpdates = postsContent || messagesContent || realNotifCount > 0 || realNewFollowers > 0;
    const hasLiveData = liveUpdates.length > 0;
    const hasInterests = allInterests.length > 0;

    if (!hasUpdates && !hasLiveData && !hasInterests) {
      return new Response(
        JSON.stringify({ 
          summary: "All caught up! 🎉 No new posts, messages, or notifications. Add some interests in settings to get personalized updates from the web!",
          hasPosts: false,
          hasMessages: false,
          unreadCount: 0,
          notificationCount: 0,
          newFollowerCount: 0,
          liveUpdates: [],
          hasLiveData: false
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const briefStyle = briefPrefs?.brief_style || 'detailed';
    const systemPrompt = `You are VYBE's friendly AI assistant creating a personalized daily brief. Be conversational, warm, and engaging.

CRITICAL RULES:
- ONLY mention specific counts that are provided in the data below. 
- If the data says 0 notifications, do NOT say "you have notifications"
- If the data says 0 new messages, do NOT mention messages
- Be ACCURATE with numbers — never invent or guess counts
- If there's nothing new, say so cheerfully

Your response should be a quick 2-3 sentence summary that:
1. Accurately reports real notification/message/follower counts if > 0
2. Highlights the most interesting live update if available
3. Feels like a friend catching you up

Style: ${briefStyle === 'concise' ? 'Be very brief, just the essentials.' : 'Be engaging and add a bit of personality.'}

Keep it under 60 words total. Use 1-2 emojis naturally.`;

    const userPrompt = contextParts.length > 0
      ? `Here is the EXACT current data (use these numbers precisely, do not make up different numbers):\n\n${contextParts.join('\n\n')}`
      : `I'm interested in: ${allInterests.join(', ')}. Give me a friendly greeting and mention I should check back later for updates.`;

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
        max_tokens: 200,
        temperature: 0.5, // Lower temperature for more factual responses
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
        hasPosts: recentPostCount > 0,
        hasMessages: unreadConvos > 0,
        unreadCount: unreadConvos,
        notificationCount: realNotifCount,
        newFollowerCount: realNewFollowers,
        recentPostCount,
        interests: allInterests,
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

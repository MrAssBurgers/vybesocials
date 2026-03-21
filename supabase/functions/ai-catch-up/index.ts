import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
  images: string[];
}

// Extract a favicon/logo URL from a domain
function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return '';
  }
}

async function fetchPerplexityData(interest: string, apiKey: string): Promise<PerplexityResult | null> {
  const query = interestSearchQueries[interest.toLowerCase()] || `latest ${interest} news and updates today`;
  
  try {
    console.log(`[Perplexity] Fetching: ${interest}`);
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
        search_recency_filter: 'day',
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => 'unknown');
      console.error(`[Perplexity] API error ${response.status} for "${interest}":`, errBody);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const citations = data.citations || [];
    const images = data.images || [];
    
    console.log(`[Perplexity] Got ${interest}: ${content.length} chars, ${citations.length} citations, ${images.length} images`);
    
    return { content, citations, images };
  } catch (error) {
    console.error(`[Perplexity] Fetch error for "${interest}":`, error);
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
    
    // Default interests if user has none set — ensures brief always has news
    const defaultInterests = ['breaking news', 'technology', 'pop culture'];
    const baseInterests = onboardingInterests.length > 0 || customTopics.length > 0
      ? [...onboardingInterests, ...customTopics]
      : defaultInterests;
    
    const allInterests = [...new Set(baseInterests)]
      .filter(i => !excludedTopics.includes(i));

    // ── REAL-TIME DATA: Fetch actual counts from DB (all in parallel) ──
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Fire all queries in parallel
    const [
      notifResult,
      followsResult,
      convResult,
      newFollowerResult,
      friendReqResult,
      streakResult,
      challengeResult,
      levelResult,
      unreadNotifsResult,
      unreadMsgsResult,
    ] = await Promise.all([
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', profileId).eq('read', false),
      supabase.from('follows').select('following_id').eq('follower_id', profileId),
      supabase.from('conversation_members').select(`conversation_id, last_read_at, conversations!inner(id, updated_at)`).eq('user_id', profileId),
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', profileId).gte('created_at', oneDayAgo),
      supabase.from('friend_requests').select('id', { count: 'exact', head: true }).eq('receiver_id', profileId).eq('status', 'pending'),
      supabase.from('login_streaks').select('current_streak, longest_streak').eq('user_id', user.id).single(),
      supabase.from('challenges').select(`id, title, requirement_count, reward_xp, type, challenge_progress!inner(current_count, is_completed)`).eq('is_active', true).eq('challenge_progress.user_id', profileId).eq('challenge_progress.is_completed', false).limit(5),
      supabase.from('user_levels').select('current_level, total_xp').eq('user_id', user.id).single(),
      supabase.from('notifications').select('id, type, message, created_at, sender_id, post_id, read').eq('user_id', profileId).eq('read', false).order('created_at', { ascending: false }).limit(10),
      supabase.from('conversation_members').select(`conversation_id, last_read_at, conversations!inner(id, updated_at, name, is_group, messages(id, content, created_at, media_type, sender_id, profiles:sender_id(username, display_name)))`).eq('user_id', profileId).order('conversations(updated_at)', { ascending: false }).limit(10),
    ]);

    const realNotifCount = notifResult.count || 0;
    const newFollowerCount = newFollowerResult.count || 0;
    const pendingFriendRequests = friendReqResult.count || 0;
    const streak = streakResult.data?.current_streak || 0;
    const userLevel = levelResult.data?.current_level || 1;
    const userXp = levelResult.data?.total_xp || 0;

    // Process active challenges
    const activeChallenges = (challengeResult.data || []).map((c: any) => ({
      title: c.title,
      type: c.type,
      current: c.challenge_progress?.[0]?.current_count || 0,
      target: c.requirement_count,
      xp: c.reward_xp || 0,
    }));

    // Process follows for posts
    const followingIds = followsResult.data?.map((f: any) => f.following_id) || [];
    let postsContent = "";
    let recentPostCount = 0;
    
    if (followingIds.length > 0) {
      const { data: posts, count: postCount } = await supabase
        .from('posts')
        .select(`id, caption, created_at, profiles:author_id(username, display_name)`, { count: 'exact' })
        .in('author_id', followingIds)
        .gte('created_at', oneDayAgo)
        .order('created_at', { ascending: false })
        .limit(20);

      recentPostCount = postCount || 0;
      if (posts?.length) {
        postsContent = posts.slice(0, 5).map((p: any) => {
          const author = p.profiles?.display_name || p.profiles?.username || 'Someone';
          return `- ${author}: "${p.caption || 'shared a photo/video'}"`;
        }).join('\n');
      }
    }

    // Process unread conversations with message previews
    let unreadConvos = 0;
    const unreadMessagePreviews: Array<{ conversationId: string; senderName: string; preview: string; isGroup: boolean; groupName?: string; time: string }> = [];
    
    if (unreadMsgsResult.data) {
      for (const conv of unreadMsgsResult.data) {
        const lastRead = conv.last_read_at ? new Date(conv.last_read_at) : new Date(0);
        const convoData = conv.conversations as any;
        const updated = new Date(convoData.updated_at);
        if (updated > lastRead) {
          unreadConvos++;
          const messages = convoData.messages || [];
          const unreadMsgs = messages
            .filter((m: any) => new Date(m.created_at) > lastRead && m.sender_id !== profileId)
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
          
          if (unreadMsgs.length > 0) {
            const latestMsg = unreadMsgs[0];
            const sender = latestMsg.profiles;
            let preview = latestMsg.content || '';
            if (!preview && latestMsg.media_type) {
              const mediaLabels: Record<string, string> = { image: '📷 Photo', video: '🎬 Video', audio: '🎤 Voice message', vybe: '📸 Vybe' };
              preview = mediaLabels[latestMsg.media_type] || '📎 Media';
            }
            unreadMessagePreviews.push({
              conversationId: conv.conversation_id,
              senderName: sender?.display_name || sender?.username || 'Someone',
              preview: preview.slice(0, 80),
              isGroup: convoData.is_group || false,
              groupName: convoData.name || undefined,
              time: latestMsg.created_at,
            });
          }
        }
      }
    } else if (convResult.data) {
      for (const conv of convResult.data) {
        const lastRead = conv.last_read_at ? new Date(conv.last_read_at) : new Date(0);
        const updated = new Date((conv.conversations as any).updated_at);
        if (updated > lastRead) unreadConvos++;
      }
    }

    // Process notification details
    const notificationDetails: Array<{ type: string; message: string; time: string }> = [];
    if (unreadNotifsResult.data) {
      for (const notif of unreadNotifsResult.data) {
        notificationDetails.push({ type: notif.type || 'general', message: notif.message || '', time: notif.created_at });
      }
    }

    // ── Fetch Perplexity live updates with images ──
    interface LiveUpdate {
      interest: string;
      content: string;
      sources: string[];
      imageUrl?: string;
      sourceFavicons?: string[];
    }
    
    let liveUpdates: LiveUpdate[] = [];
    
    const PERPLEXITY_API_KEY = Deno.env.get("PERPLEXITY_API_KEY");
    console.log(`[Brief] Interests: ${allInterests.join(', ')} | Perplexity key: ${PERPLEXITY_API_KEY ? 'set' : 'MISSING'}`);
    
    if (PERPLEXITY_API_KEY && allInterests.length > 0) {
      const selectedInterests = allInterests.slice(0, 5);
      const fetchPromises = selectedInterests.map(async (interest: string): Promise<LiveUpdate | null> => {
        const result = await fetchPerplexityData(interest, PERPLEXITY_API_KEY);
        if (result && result.content) {
          // Get image: first from Perplexity images, then try og-image proxy from first citation
          let imageUrl: string | undefined;
          
          // Use Perplexity's returned images if available
          if (result.images && result.images.length > 0) {
            imageUrl = result.images[0];
          }
          
          // If no Perplexity images, try extracting an og:image from the first citation
          if (!imageUrl && result.citations && result.citations.length > 0) {
            // Use a favicon as fallback thumbnail
            imageUrl = undefined; // Will use favicon display instead
          }

          // Generate favicons for all citation sources
          const sourceFavicons = (result.citations || []).slice(0, 4).map((url: string) => getFaviconUrl(url)).filter(Boolean);

          return { 
            interest, 
            content: result.content, 
            sources: result.citations || [],
            imageUrl,
            sourceFavicons,
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

    const hasLiveData = liveUpdates.length > 0;
    const userName = userProfile?.display_name || userProfile?.username || 'there';

    // Build the system prompt
    const systemPrompt = `You are VYBE's friendly AI assistant creating a personalized daily brief. Keep it warm, concise, and actionable. Use emojis sparingly. Never exceed 3 sentences. Address the user by name if available.`;

    let userPrompt = `Create a brief daily catch-up for ${userName}.\n`;
    userPrompt += `Stats: ${realNotifCount} notifications, ${unreadConvos} unread messages, ${newFollowerCount} new followers, ${pendingFriendRequests} friend requests.\n`;
    userPrompt += `Streak: ${streak} days. Level: ${userLevel} (${userXp} XP).\n`;
    if (recentPostCount > 0) userPrompt += `${recentPostCount} new posts from people they follow.\n`;
    if (postsContent) userPrompt += `Recent posts:\n${postsContent}\n`;
    if (activeChallenges.length > 0) {
      userPrompt += `Active challenges: ${activeChallenges.map((c: any) => `${c.title} (${c.current}/${c.target})`).join(', ')}.\n`;
    }
    if (hasLiveData) {
      userPrompt += `Trending topics: ${liveUpdates.map((u: any) => `${u.interest}: ${u.content.slice(0, 100)}`).join('; ')}.\n`;
    }
    userPrompt += `Give a quick, personalized summary highlighting what matters most.`;

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
        temperature: 0.5,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    let summary = data.choices?.[0]?.message?.content?.trim() || "";
    
    // Fallback if AI returns empty
    if (!summary) {
      const parts: string[] = [];
      if (realNotifCount > 0) parts.push(`You have ${realNotifCount} notification${realNotifCount > 1 ? 's' : ''}`);
      if (unreadConvos > 0) parts.push(`${unreadConvos} unread message${unreadConvos > 1 ? 's' : ''}`);
      if (newFollowerCount > 0) parts.push(`${newFollowerCount} new follower${newFollowerCount > 1 ? 's' : ''}`);
      if (streak > 0) parts.push(`🔥 ${streak}-day streak`);
      summary = parts.length > 0 
        ? `Hey ${userName}! ${parts.join(', ')}. Keep the momentum going!`
        : `Hey ${userName}! Everything's caught up — time to create something new! 🚀`;
    }

    return new Response(
      JSON.stringify({ 
        summary,
        hasPosts: recentPostCount > 0,
        hasMessages: unreadConvos > 0,
        unreadCount: unreadConvos,
        notificationCount: realNotifCount,
        newFollowerCount,
        recentPostCount,
        pendingFriendRequests,
        streak,
        userLevel,
        userXp,
        activeChallenges,
        interests: allInterests,
        liveUpdates,
        hasLiveData,
        unreadMessagePreviews,
        notificationDetails,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AI Catch-up error:", error);
    return new Response(
      JSON.stringify({ 
        summary: "Welcome back! Tap refresh to load your personalized brief. 🌟",
        hasPosts: false,
        hasMessages: false,
        unreadCount: 0,
        notificationCount: 0,
        newFollowerCount: 0,
        recentPostCount: 0,
        pendingFriendRequests: 0,
        streak: 0,
        userLevel: 1,
        userXp: 0,
        activeChallenges: [],
        liveUpdates: [],
        hasLiveData: false,
        unreadMessagePreviews: [],
        notificationDetails: [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

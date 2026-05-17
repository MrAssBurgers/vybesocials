import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.90.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface LiveUpdate {
  interest: string;
  content: string;
  sources: string[];
  imageUrl?: string;
  sourceFavicons?: string[];
  category?: string;
}

function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return '';
  }
}

async function fetchGeminiNews(
  interests: string[],
  latitude: number | null,
  longitude: number | null,
): Promise<LiveUpdate[]> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.error("[Brief] LOVABLE_API_KEY not set");
    return [];
  }

  const interestList = interests.map((i, idx) => `${idx + 1}. ${i}`).join('\n');
  let locationContext = '';
  if (latitude && longitude) {
    locationContext = `\nAlso include one item about local news/events/weather near coordinates ${latitude.toFixed(2)}, ${longitude.toFixed(2)}. Use category "local" and label "📍 Near You" for it.`;
  }

  const today = new Date().toISOString().split('T')[0];

  const prompt = `You are a news assistant. Today is ${today}. Return the latest trending news for these topics:
${interestList}
${locationContext}

Return ONLY valid JSON, no markdown fences. Format:
{"items":[{"topic":"<topic label>","summary":"<2-3 sentence factual summary with specific details, names, numbers, dates>","sources":["<real_url_1>","<real_url_2>"],"category":"<interests|local|world>"}]}

Rules:
- One item per topic, plus the local item if requested
- Summaries must be factual, current, and specific (names, numbers, dates)
- CRITICAL: Each item MUST include 2-3 real source URLs from major news outlets (e.g. reuters.com, apnews.com, bbc.com, cnn.com, theverge.com, techcrunch.com, nytimes.com, etc.)
- URLs must be real, complete article URLs — NOT homepages. Example: "https://www.reuters.com/technology/article-slug-2025-04-11/"
- category is "interests" for topic items, "local" for location-based, "world" for general news`;

  try {
    console.log("[Brief] Calling Lovable AI Gateway for news...");
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 8192,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown');
      console.error(`[Brief] AI Gateway error ${response.status}:`, errText);
      return [];
    }

    const data = await response.json();
    const textContent = data.choices?.[0]?.message?.content?.trim() || '';

    console.log(`[Brief] AI Gateway response length: ${textContent.length}`);

    // Parse JSON from response (strip markdown fences if present)
    let jsonStr = textContent;
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }

    // Sanitize control characters
    jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, (ch: string) => {
      if (ch === '\n' || ch === '\r' || ch === '\t') return ' ';
      return '';
    });

    let parsed: { items: Array<{ topic: string; summary: string; sources?: string[]; category?: string }> };
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.warn("[Brief] JSON.parse failed, attempting regex fallback:", parseErr);
      try {
        const items: Array<{ topic: string; summary: string; sources: string[]; category: string }> = [];
        const topicMatches = jsonStr.matchAll(/"topic"\s*:\s*"([^"]+)"/g);
        const summaryMatches = [...jsonStr.matchAll(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/g)];
        const categoryMatches = [...jsonStr.matchAll(/"category"\s*:\s*"([^"]+)"/g)];
        let idx = 0;
        for (const tm of topicMatches) {
          items.push({
            topic: tm[1],
            summary: summaryMatches[idx]?.[1]?.replace(/\\"/g, '"').replace(/\\n/g, ' ') || 'No details available.',
            sources: [],
            category: categoryMatches[idx]?.[1] || 'interests',
          });
          idx++;
        }
        if (items.length > 0) {
          console.log(`[Brief] Regex fallback extracted ${items.length} items`);
          parsed = { items };
        } else {
          console.error("[Brief] Regex fallback found 0 items. Raw:", jsonStr.slice(0, 500));
          return [];
        }
      } catch (regexErr) {
        console.error("[Brief] Regex fallback also failed:", regexErr);
        return [];
      }
    }

    if (!parsed.items || !Array.isArray(parsed.items)) {
      console.error("[Brief] Response missing items array");
      return [];
    }

    return parsed.items.map((item) => {
      const sources = (item.sources || [])
        .filter((url: string) => url.startsWith('http') && !url.includes('vertexaisearch') && !url.includes('googleapis.com/'))
        .slice(0, 6);
      const sourceFavicons = sources.slice(0, 4).map(getFaviconUrl).filter(Boolean);

      return {
        interest: item.topic,
        content: item.summary,
        sources,
        sourceFavicons,
        category: item.category || 'interests',
      };
    });
  } catch (error) {
    console.error("[Brief] AI Gateway fetch error:", error);
    return [];
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

    const token = authHeader.replace("Bearer ", "");

    // Parse body (GPS, optional service-role overrides)
    let latitude: number | null = null;
    let longitude: number | null = null;
    let overrideUserId: string | null = null;
    let cacheSlot: 'morning' | 'lunch' | 'dinner' | null = null;
    try {
      const body = await req.json();
      if (body.latitude && body.longitude) {
        latitude = body.latitude;
        longitude = body.longitude;
      }
      if (body.user_id && typeof body.user_id === 'string') overrideUserId = body.user_id;
      if (body.cache_slot && ['morning','lunch','dinner'].includes(body.cache_slot)) cacheSlot = body.cache_slot;
    } catch {}

    // Auth: support service-role override for server-side pre-warming
    const isServiceRole = token === supabaseServiceKey;
    let user: { id: string } | null = null;
    if (isServiceRole && overrideUserId) {
      user = { id: overrideUserId };
    } else {
      const { data: { user: authUser }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !authUser) {
        return new Response(
          JSON.stringify({ error: "Invalid user" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      user = authUser;
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

    // Combine interests
    const onboardingInterests = userProfile?.interests || [];
    const customTopics = briefPrefs?.custom_topics || [];
    const excludedTopics = briefPrefs?.excluded_topics || [];
    const defaultInterests = ['breaking news', 'technology', 'pop culture'];
    
    const baseInterests = customTopics.length > 0 || onboardingInterests.length > 0
      ? [...customTopics, ...onboardingInterests]
      : defaultInterests;
    
    const allInterests = [...new Set(baseInterests)]
      .filter(i => !excludedTopics.includes(i))
      .slice(0, 7);

    console.log(`[Brief] Final interests: ${allInterests.join(', ')}`);

    // ── Fetch app data + Gemini news in parallel ──
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

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
      liveUpdates,
    ] = await Promise.all([
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', profileId).eq('read', false),
      supabase.from('follows').select('following_id').eq('follower_id', profileId),
      supabase.from('conversation_members').select(`conversation_id, last_read_at, conversations!inner(id, updated_at)`).eq('user_id', profileId),
      supabase.from('follows').select('id', { count: 'exact', head: true }).eq('following_id', profileId).gte('created_at', oneDayAgo),
      supabase.from('friend_requests').select('id', { count: 'exact', head: true }).eq('receiver_id', profileId).eq('status', 'pending'),
      supabase.from('login_streaks').select('current_streak, longest_streak').eq('user_id', user.id).single(),
      supabase.from('challenges').select(`id, title, requirement_count, reward_xp, type, challenge_progress!inner(current_count, is_completed)`).eq('is_active', true).eq('challenge_progress.user_id', profileId).eq('challenge_progress.is_completed', false).limit(5),
      supabase.from('user_levels').select('current_level, total_xp').eq('user_id', user.id).single(),
      supabase.from('notifications').select('id, type, reason, created_at, actor_id, post_id, read').eq('user_id', profileId).eq('read', false).order('created_at', { ascending: false }).limit(10),
      supabase.from('conversation_members').select(`conversation_id, last_read_at, conversations!inner(id, updated_at, name, is_group, messages(id, content, created_at, media_type, sender_id, profiles:sender_id(username, display_name)))`).eq('user_id', profileId).order('conversations(updated_at)', { ascending: false }).limit(10),
      // Gemini news fetch runs in parallel with DB queries
      fetchGeminiNews(allInterests, latitude, longitude),
    ]);

    const realNotifCount = notifResult.count || 0;
    const newFollowerCount = newFollowerResult.count || 0;
    const pendingFriendRequests = friendReqResult.count || 0;
    const streak = streakResult.data?.current_streak || 0;
    const userLevel = levelResult.data?.current_level || 1;
    const userXp = levelResult.data?.total_xp || 0;

    const activeChallenges = (challengeResult.data || []).map((c: any) => ({
      title: c.title,
      type: c.type,
      current: c.challenge_progress?.[0]?.current_count || 0,
      target: c.requirement_count,
      xp: c.reward_xp || 0,
    }));

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

    const notificationDetails: Array<{ type: string; message: string; time: string }> = [];
    if (unreadNotifsResult.data) {
      for (const notif of unreadNotifsResult.data) {
        notificationDetails.push({ type: notif.type || 'general', message: notif.reason || '', time: notif.created_at });
      }
    }

    // ── Generate summary with Lovable AI ──
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const hasLiveData = liveUpdates.length > 0;
    const userName = userProfile?.display_name || userProfile?.username || 'there';

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
    if (latitude && longitude) {
      userPrompt += `User has shared their location (${latitude.toFixed(1)}, ${longitude.toFixed(1)}). Mention any local highlights if relevant.\n`;
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

    const responsePayload = {
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
    };

    // Persist to daily_brief_cache when called via service-role pre-warm
    if (isServiceRole && cacheSlot && user?.id) {
      try {
        await supabase.from('daily_brief_cache').upsert({
          user_id: user.id,
          slot: cacheSlot,
          payload: responsePayload,
          generated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: 'user_id,slot' });
      } catch (e) {
        console.warn('[ai-catch-up] cache upsert failed', e);
      }
    }

    return new Response(
      JSON.stringify(responsePayload),
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

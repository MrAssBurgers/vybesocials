import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { chatCompletion, generateImage } from './_shared/geminiAi.js';
import {
  CHEAP_CHAT_MODEL,
  enforceAiQuota,
  getUserAiApiKey,
  resolveProfileIdFromAuth,
} from './_shared/aiQuota.js';
import { runVybeCheckScan } from './_shared/contentSafety.js';

const SECRETS = ['GEMINI_API_KEY'];

async function loadUserProfile(uid: string): Promise<Record<string, unknown>> {
  const direct = await db.collection('profiles').doc(uid).get();
  if (direct.exists) return (direct.data() || {}) as Record<string, unknown>;
  const byUserId = await db.collection('profiles').where('user_id', '==', uid).limit(1).get();
  return (byUserId.docs[0]?.data() || {}) as Record<string, unknown>;
}

/** ai-chat — conversational assistant with VYBE DNA context. */
export const aiChat = onCall({ secrets: SECRETS }, async (request) => {
  const authUid = requireAuth(request);
  enforceRateLimit(await rateLimit(`aichat:${authUid}`, 12, 60));
  const profileId = await resolveProfileIdFromAuth(authUid);
  const byokKey =
    (await getUserAiApiKey(profileId, 'google')) ||
    (await getUserAiApiKey(profileId, 'openai'));
  const quota = await enforceAiQuota(profileId, 'chat');

  const { messages, aiName, aiPersonality, location, imageBase64, imageMimeType } =
    (request.data || {}) as {
      messages?: any[];
      aiName?: string;
      aiPersonality?: string;
      location?: { city?: string; lat?: number; lng?: number };
      imageBase64?: string;
      imageMimeType?: string;
    };
  if (!Array.isArray(messages) || !messages.length) throw new HttpsError('invalid-argument', 'messages required');

  try {
    const [dnaSnap, profile] = await Promise.all([
      db.collection('vybe_dna').doc(profileId).get(),
      loadUserProfile(authUid),
    ]);
    const dna = dnaSnap.data() || {};
    const interestsRaw = profile.interests ?? profile.onboarding_interests ?? [];
    const interests = (Array.isArray(interestsRaw) ? interestsRaw : [])
      .map((v) => (typeof v === 'string' ? v : String(v ?? '')))
      .filter(Boolean)
      .slice(0, 10);
    const name = (aiName || 'VYBE-AI').slice(0, 50);
    const personality = (aiPersonality || 'A friendly, helpful AI assistant.').slice(0, 500);
    const loc = location ? `\nLocation: ${location.city || 'Unknown'} (${location.lat?.toFixed?.(2)}, ${location.lng?.toFixed?.(2)}).` : '';

    let dnaSnippet = '';
    try {
      dnaSnippet = JSON.stringify(dna.personality_vector ?? {}).slice(0, 400);
    } catch {
      dnaSnippet = '';
    }

    const system = `You are ${name}. ${personality}\nUser interests: ${interests.join(', ') || 'none'}.\nDNA: ${dnaSnippet}${loc}`;
    const sanitized = messages
      .filter((m) => m && typeof m.content === 'string' && m.content.trim())
      .slice(-16)
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: String(m.content).slice(0, 3000),
      }));

    const imgB64 = typeof imageBase64 === 'string' ? imageBase64.slice(0, 2_500_000) : '';
    const imgMime = typeof imageMimeType === 'string' ? imageMimeType.slice(0, 64) : '';
    let chatMessages: Parameters<typeof chatCompletion>[0]['messages'] = [
      { role: 'system', content: system },
      ...sanitized,
    ];
    if (imgB64 && imgMime.startsWith('image/') && chatMessages.length > 0) {
      const last = chatMessages[chatMessages.length - 1];
      if (last.role === 'user') {
        chatMessages = [
          ...chatMessages.slice(0, -1),
          {
            role: 'user',
            content: [
              { type: 'text', text: typeof last.content === 'string' ? last.content : 'What is in this image?' },
              { type: 'image_url', image_url: { url: `data:${imgMime};base64,${imgB64}` } },
            ],
          },
        ];
      }
    }

    const { content } = await chatCompletion({
      messages: chatMessages,
      model: CHEAP_CHAT_MODEL,
      max_tokens: 768,
      temperature: 0.75,
      apiKey: byokKey || undefined,
    });
    if (!content?.trim()) throw new HttpsError('internal', 'AI returned an empty reply');
    return {
      reply: content,
      quota: {
        chat: quota.chat,
        hasByok: quota.hasByok,
        isPremium: quota.isPremium,
      },
    };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('[aiChat]', err);
    const msg = err instanceof Error ? err.message : 'AI chat failed';
    if (/quota|limit|credit|billing|depleted/i.test(msg)) {
      throw new HttpsError('resource-exhausted', msg);
    }
    if (/auth|unauthenticated|permission|invalid.*key|API key/i.test(msg)) {
      throw new HttpsError('failed-precondition', msg);
    }
    throw new HttpsError('unavailable', msg);
  }
});

/** ai-catch-up — daily brief generator (full BriefData shape for client). */
export const aiCatchUp = onCall({ secrets: SECRETS, timeoutSeconds: 90 }, async (request) => {
  const authUid = requireAuth(request);
  const profileId = await resolveProfileIdFromAuth(authUid);
  const { latitude, longitude } = (request.data || {}) as { latitude?: number; longitude?: number };

  const profile = await loadUserProfile(authUid);
  const prefsSnap = await db.collection('ai_brief_preferences').doc(profileId).get();
  const prefs = prefsSnap.data() || {};
  const onboardingInterests = (profile.interests || profile.onboarding_interests || []) as string[];
  const customTopics = (prefs.custom_topics as string[]) || [];
  const interests =
    customTopics.length || onboardingInterests.length
      ? [...new Set([...customTopics, ...onboardingInterests])].slice(0, 7)
      : ['technology', 'pop culture', 'breaking news'];

  const today = new Date().toISOString().split('T')[0];
  const locCtx =
    latitude && longitude
      ? `\nInclude one local item near ${latitude.toFixed(2)}, ${longitude.toFixed(2)}.`
      : '';
  const prompt = `Today is ${today}. Return JSON: {"items":[{"topic":"…","summary":"…","sources":["url"],"category":"interests|local|world"}]}\nTopics: ${interests.join(', ')}.${locCtx}`;

  let liveUpdates: Array<{ interest: string; content: string; sources: string[]; category?: string }> = [];
  try {
    const byokKey =
      (await getUserAiApiKey(profileId, 'google')) ||
      (await getUserAiApiKey(profileId, 'openai'));
    const { content } = await chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      apiKey: byokKey || undefined,
    });
    const parsed = JSON.parse(content);
    const items = Array.isArray(parsed) ? parsed : parsed.items || parsed.updates || [];
    liveUpdates = items.map((item: any) => ({
      interest: String(item.topic || item.interest || 'News'),
      content: String(item.summary || item.content || ''),
      sources: Array.isArray(item.sources) ? item.sources.map(String).filter((u: string) => u.startsWith('http')) : [],
      category: item.category ? String(item.category) : 'interests',
    }));
  } catch (e) {
    console.warn('[aiCatchUp] news generation failed:', e);
  }

  const userName = String(profile.display_name || profile.username || 'there');
  const parts: string[] = [];
  if (liveUpdates.length) parts.push(`${liveUpdates.length} trending topics`);
  const summary =
    parts.length > 0
      ? `Hey ${userName}! ${parts.join(', ')} — tap a story for details.`
      : `Hey ${userName}! Your brief is ready — check back soon for fresh updates.`;

  const payload = {
    summary,
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
    liveUpdates,
    hasLiveData: liveUpdates.length > 0,
    unreadMessagePreviews: [],
    notificationDetails: [],
  };

  await db.collection('daily_brief_cache').doc(`${profileId}_${today}`).set({
    user_id: profileId,
    date: today,
    payload,
    created_at: new Date().toISOString(),
  });

  return payload;
});

/** ai-smart-replies — three short reply suggestions for a chat. */
export const aiSmartReplies = onCall({ secrets: SECRETS }, async (request) => {
  const authUid = requireAuth(request);
  enforceRateLimit(await rateLimit(`aismart:${authUid}`, 20, 60));
  const profileId = await resolveProfileIdFromAuth(authUid);
  const byokKey =
    (await getUserAiApiKey(profileId, 'google')) ||
    (await getUserAiApiKey(profileId, 'openai'));
  await enforceAiQuota(profileId, 'smart_replies');

  const { lastMessage, context } = (request.data || {}) as { lastMessage?: string; context?: string };
  if (!lastMessage) throw new HttpsError('invalid-argument', 'lastMessage required');
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: 'Generate exactly 3 short (under 8 words) casual reply suggestions. Return JSON: {"replies":["…","…","…"]}.' },
      { role: 'user', content: `Last message: ${lastMessage}\nContext: ${context || ''}` },
    ],
    response_format: { type: 'json_object' },
    model: CHEAP_CHAT_MODEL,
    max_tokens: 200,
    temperature: 0.6,
    apiKey: byokKey || undefined,
  });
  try { return JSON.parse(content); } catch { return { replies: [] }; }
});

/** ai-comment-suggestions — comment ideas for a post. */
export const aiCommentSuggestions = onCall({ secrets: SECRETS }, async (request) => {
  requireAuth(request);
  const { postCaption, postType } = (request.data || {}) as { postCaption?: string; postType?: string };
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: 'Suggest 4 short authentic comments. Return JSON: {"comments":["…",…]}.' },
      { role: 'user', content: `Post (${postType || 'post'}): ${postCaption || '(no caption)'}` },
    ],
    response_format: { type: 'json_object' },
  });
  try { return JSON.parse(content); } catch { return { comments: [] }; }
});

/** ai-message-assist — rewrite/translate/tone-adjust. */
export const aiMessageAssist = onCall({ secrets: SECRETS }, async (request) => {
  const authUid = requireAuth(request);
  enforceRateLimit(await rateLimit(`aiassist:${authUid}`, 20, 60));
  const profileId = await resolveProfileIdFromAuth(authUid);
  const byokKey =
    (await getUserAiApiKey(profileId, 'google')) ||
    (await getUserAiApiKey(profileId, 'openai'));
  await enforceAiQuota(profileId, 'assist');

  const { text, mode = 'improve', targetLang } = (request.data || {}) as { text?: string; mode?: string; targetLang?: string };
  if (!text) throw new HttpsError('invalid-argument', 'text required');
  const prompt = mode === 'translate'
    ? `Translate to ${targetLang || 'English'}: ${text}`
    : mode === 'shorten' ? `Shorten without losing meaning: ${text}`
    : mode === 'formal' ? `Rewrite formally: ${text}`
    : mode === 'friendlier' ? `Rewrite in a warmer, friendlier tone. Keep the user's voice: ${text}`
    : mode === 'grammar' ? `Fix grammar and spelling only. Return corrected text: ${text}`
    : `Improve clarity & tone: ${text}`;
  const { content } = await chatCompletion({
    messages: [{ role: 'user', content: prompt }],
    model: CHEAP_CHAT_MODEL,
    max_tokens: 400,
    temperature: 0.5,
    apiKey: byokKey || undefined,
  });
  return { result: content };
});

/** ai-humanize — make AI-sounding text natural. */
export const aiHumanize = onCall({ secrets: SECRETS }, async (request) => {
  requireAuth(request);
  const { text, tone } = (request.data || {}) as { text?: string; tone?: string };
  if (!text) throw new HttpsError('invalid-argument', 'text required');
  const toneHint = tone ? `Tone: ${tone}.` : '';
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: `Rewrite text to sound natural and human. ${toneHint} Keep meaning. Reply with only the rewritten text.` },
      { role: 'user', content: text },
    ],
  });
  return { result: content };
});

/** ai-chat-summary — summarize a thread. */
export const aiChatSummary = onCall({ secrets: SECRETS }, async (request) => {
  requireAuth(request);
  const { messages } = (request.data || {}) as { messages?: { sender?: string; text?: string }[] };
  if (!messages?.length) throw new HttpsError('invalid-argument', 'messages required');
  const transcript = messages.slice(-100).map((m) => `${m.sender || 'user'}: ${m.text || ''}`).join('\n');
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: 'Summarize this chat in 2-3 short sentences.' },
      { role: 'user', content: transcript },
    ],
  });
  return { summary: content };
});

/** ai-profile-writer — bio generator. */
export const aiProfileWriter = onCall({ secrets: SECRETS }, async (request) => {
  requireAuth(request);
  const { interests = [], vibe = 'fun' } = (request.data || {}) as { interests?: string[]; vibe?: string };
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: 'Write a 120-char-max profile bio. Return only the bio text.' },
      { role: 'user', content: `Vibe: ${vibe}. Interests: ${interests.join(', ')}` },
    ],
  });
  return { bio: content };
});

/** ai-safety-scan / scan-content-safety — Vybe Check (Vision Safe Search + Gemini). */
export const aiSafetyScan = onCall({ secrets: SECRETS }, async (request) => {
  const uid = requireAuth(request);
  enforceRateLimit(await rateLimit(`safety_scan:${uid}`, 30, 60));

  const body = (request.data || {}) as {
    image_base64?: string;
    mime_type?: string;
    audio_transcript?: string;
    scan_type?: 'image' | 'audio' | 'both';
    text?: string;
  };

  const hasPayload =
    body.image_base64 ||
    body.audio_transcript?.trim() ||
    body.text?.trim();

  if (!hasPayload) {
    return {
      allowed: true,
      result: 'allowed',
      categories: [],
      score: 0,
      message: 'Nothing to scan.',
      suggested_age_rating: 'safe',
      age_rating_reasons: [],
    };
  }

  try {
    return await runVybeCheckScan(body, process.env.GEMINI_API_KEY);
  } catch (err) {
    console.error('[aiSafetyScan]', err);
    throw new HttpsError('internal', err instanceof Error ? err.message : 'Safety scan failed');
  }
});

export const scanContentSafety = aiSafetyScan;
export const scanVideoSafety = aiSafetyScan;
export const moderateContent = aiSafetyScan;

/** generate-theme / generate-advanced-theme — full VYBE theme JSON for AI Vybe Designer. */
const ADVANCED_THEME_SYSTEM = `You are an elite UI theme designer for VYBE social app.
When the user names a brand, franchise, sports team, app, or aesthetic — match their REAL official colors and mood as closely as possible (e.g. Nike = black/white/orange, Spotify = #1DB954 green, Coca-Cola = red/white, Tiffany = robin-egg blue).
When they describe a scene or vibe (sunset beach, cyberpunk Tokyo, cozy coffee shop) — derive a cohesive palette from that scene's dominant colors.
Return ONLY valid JSON: {"theme":{"colorPrimary":"H S% L%","colorSecondary":"...","colorAccent":"...","bgMain":"...","bgCard":"...","textPrimary":"...","textSecondary":"...","borderColor":"...","borderRadius":"medium","mode":"dark"|"light","themeName":"creative name","backgroundEffect":"aurora"|"particles"|"none"|"stars"|"bubbles","animationSpeed":"normal","animationStyle":"smooth"}}
Use HSL format without hsl() wrapper. Ensure WCAG contrast — text must be readable on backgrounds.`;

export const generateTheme = onCall({ secrets: SECRETS }, async (request) => {
  const authUid = requireAuth(request);
  enforceRateLimit(await rateLimit(`gentheme:${authUid}`, 12, 60));
  const profileId = await resolveProfileIdFromAuth(authUid);
  const byokKey = await getUserAiApiKey(profileId, 'google');

  const {
    prompt,
    basePreset,
    interests = [],
    selectedFont,
    selectedAnimation,
  } = (request.data || {}) as {
    prompt?: string;
    basePreset?: string;
    interests?: string[];
    selectedFont?: string;
    selectedAnimation?: { speed?: string; style?: string };
  };
  const userPrompt = [
    prompt || 'A calm midnight purple VYBE theme',
    basePreset ? `Base preset: ${basePreset}` : '',
    interests.length ? `Interests: ${interests.slice(0, 8).join(', ')}` : '',
    selectedFont ? `Font style: ${selectedFont}` : '',
    selectedAnimation ? `Animation: ${JSON.stringify(selectedAnimation)}` : '',
  ].filter(Boolean).join('\n');

  try {
    const { content } = await chatCompletion({
      messages: [
        { role: 'system', content: ADVANCED_THEME_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      apiKey: byokKey || undefined,
    });
    try {
      const parsed = JSON.parse(content);
      const theme = parsed.theme || parsed;
      if (theme && (theme.colorPrimary || theme.primary)) {
        return { theme };
      }
    } catch { /* fall through */ }
  } catch (err) {
    console.error('[generateTheme]', err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError(
      'failed-precondition',
      err instanceof Error ? err.message : 'Theme generation failed — set GEMINI_API_KEY or add your key in Settings → VYBE AI',
    );
  }

  return {
    theme: {
      colorPrimary: '270 70% 58%',
      colorSecondary: '200 80% 50%',
      colorAccent: '320 85% 60%',
      bgMain: '240 15% 8%',
      bgCard: '240 12% 12%',
      textPrimary: '0 0% 98%',
      textSecondary: '240 5% 65%',
      borderRadius: 'medium',
      mode: 'dark',
      themeName: 'VYBE Midnight',
      backgroundEffect: 'aurora',
      animationSpeed: 'normal',
      animationStyle: 'smooth',
    },
  };
});
export const generateAdvancedTheme = generateTheme;

/** generate-background — AI image (quota-gated). */
export const generateBackground = onCall({ secrets: SECRETS, timeoutSeconds: 90 }, async (request) => {
  const authUid = requireAuth(request);
  enforceRateLimit(await rateLimit(`aiimg:${authUid}`, 6, 60));
  const profileId = await resolveProfileIdFromAuth(authUid);
  await enforceAiQuota(profileId, 'image_gen');

  const { prompt } = (request.data || {}) as { prompt?: string };
  const safePrompt = String(prompt || 'abstract neon gradient backdrop').slice(0, 500);
  const url = await generateImage(safePrompt);
  if (!url) throw new HttpsError('unavailable', 'Image generation failed — try again');
  return { url, prompt: safePrompt };
});

/** generate-caption — caption a post. */
export const generateCaption = onCall({ secrets: SECRETS }, async (request) => {
  requireAuth(request);
  const { description, vibe, tags, contentType } = (request.data || {}) as {
    description?: string;
    vibe?: string;
    tags?: string[];
    contentType?: string;
  };
  const tagLine = Array.isArray(tags) ? tags.slice(0, 8).join(', ') : '';
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: 'Write 3 short post captions (max 120 chars each). Return JSON {captions:[]}.' },
      {
        role: 'user',
        content: `${description || tagLine || 'social post'} — type: ${contentType || 'photo'} — vibe: ${vibe || 'casual'}`,
      },
    ],
    response_format: { type: 'json_object' },
  });
  try { return JSON.parse(content); } catch { return { captions: [] }; }
});

/** detect-ai-content — VYBE Check: is this post AI-generated? */
export const detectAiContent = onCall({ secrets: SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const { post_id, caption, image_base64, mime_type, content_type } =
    (request.data || {}) as {
      post_id?: string;
      caption?: string;
      image_base64?: string;
      mime_type?: string;
      content_type?: string;
    };

  if (!image_base64 && !caption) {
    return { is_ai: false, confidence: 0, reason: 'No content to analyze' };
  }

  if (post_id) {
    const postSnap = await db.collection('posts').doc(post_id).get();
    if (postSnap.exists) {
      const post = postSnap.data() as { user_id?: string };
      if (post.user_id && post.user_id !== uid) {
        const profile = await db.collection('profiles').where('user_id', '==', uid).limit(1).get();
        const ownerOk = post.user_id === uid || profile.docs.some((d) => d.id === post.user_id);
        if (!ownerOk) throw new HttpsError('permission-denied', 'not your post');
      }
    }
  }

  const parts: Array<{ type: string; [k: string]: unknown }> = [
    {
      type: 'text',
      text: `Analyze if this ${content_type || 'content'} is AI-generated. Caption: "${caption || ''}". Return JSON only: {"is_ai":boolean,"confidence":0-1,"reason":"short"}`,
    },
  ];
  if (image_base64) {
    parts.push({
      type: 'image_url',
      image_url: { url: `data:${mime_type || 'image/jpeg'};base64,${image_base64}` },
    });
  }

  const { content } = await chatCompletion({
    messages: [{ role: 'user', content: parts }],
    response_format: { type: 'json_object' },
    temperature: 0.2,
  });

  let result = { is_ai: false, confidence: 0, reason: 'Analysis inconclusive' };
  try {
    result = { ...result, ...JSON.parse(content) };
  } catch { /* keep default */ }

  if (post_id) {
    await db.collection('posts').doc(post_id).set(
      {
        is_ai_generated: !!result.is_ai,
        ai_detection_confidence: result.confidence,
        ai_detection_reason: result.reason,
        ai_checked_at: new Date().toISOString(),
      },
      { merge: true },
    );
  }

  return result;
});

/** dna-chat — short DNA-aware AI thread. */
export const dnaChat = onCall({ secrets: SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const { message } = (request.data || {}) as { message?: string };
  if (!message) throw new HttpsError('invalid-argument', 'message required');
  const dna = (await db.collection('vybe_dna').doc(uid).get()).data() || {};
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: `You are the user's DNA mirror. Personality vector: ${JSON.stringify(dna.personality_vector || {}).slice(0, 400)}` },
      { role: 'user', content: message },
    ],
  });
  return { reply: content };
});

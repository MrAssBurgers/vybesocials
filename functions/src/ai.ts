import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { chatCompletion, generateImage } from './_shared/geminiAi.js';

const SECRETS = ['GEMINI_API_KEY'];

async function loadUserProfile(uid: string): Promise<Record<string, unknown>> {
  const direct = await db.collection('profiles').doc(uid).get();
  if (direct.exists) return (direct.data() || {}) as Record<string, unknown>;
  const byUserId = await db.collection('profiles').where('user_id', '==', uid).limit(1).get();
  return (byUserId.docs[0]?.data() || {}) as Record<string, unknown>;
}

/** ai-chat — conversational assistant with VYBE DNA context. */
export const aiChat = onCall({ secrets: SECRETS }, async (request) => {
  const uid = requireAuth(request);
  enforceRateLimit(await rateLimit(`aichat:${uid}`, 15, 60));
  const { messages, aiName, aiPersonality, location } =
    (request.data || {}) as { messages?: any[]; aiName?: string; aiPersonality?: string; location?: { city?: string; lat?: number; lng?: number } };
  if (!Array.isArray(messages) || !messages.length) throw new HttpsError('invalid-argument', 'messages required');

  try {
    const [dnaSnap, profile] = await Promise.all([
      db.collection('vybe_dna').doc(uid).get(),
      loadUserProfile(uid),
    ]);
    const dna = dnaSnap.data() || {};
    const interests = (profile.interests || profile.onboarding_interests || []) as string[];
    const name = (aiName || 'VYBE-AI').slice(0, 50);
    const personality = (aiPersonality || 'A friendly, helpful AI assistant.').slice(0, 500);
    const loc = location ? `\nLocation: ${location.city || 'Unknown'} (${location.lat?.toFixed?.(2)}, ${location.lng?.toFixed?.(2)}).` : '';

    const system = `You are ${name}. ${personality}\nUser interests: ${interests.slice(0, 10).join(', ') || 'none'}.\nDNA: ${JSON.stringify(dna.personality_vector || {}).slice(0, 400)}${loc}`;
    const sanitized = messages
      .filter((m) => m && typeof m.content === 'string' && m.content.trim())
      .slice(-24)
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' as const : 'user' as const,
        content: String(m.content).slice(0, 4000),
      }));

    const { content } = await chatCompletion({
      messages: [{ role: 'system', content: system }, ...sanitized],
    });
    if (!content?.trim()) throw new HttpsError('internal', 'AI returned an empty reply');
    return { reply: content };
  } catch (err) {
    if (err instanceof HttpsError) throw err;
    console.error('[aiChat]', err);
    throw new HttpsError('internal', err instanceof Error ? err.message : 'AI chat failed');
  }
});

/** ai-catch-up — daily brief generator. */
export const aiCatchUp = onCall({ secrets: SECRETS, timeoutSeconds: 60 }, async (request) => {
  const uid = requireAuth(request);
  const { interests = [], latitude, longitude } =
    (request.data || {}) as { interests?: string[]; latitude?: number; longitude?: number };
  const today = new Date().toISOString().split('T')[0];
  const locCtx = latitude && longitude ? `\nInclude one local item near ${latitude.toFixed(2)}, ${longitude.toFixed(2)}.` : '';
  const prompt = `Today is ${today}. Provide 5 brief trending news items for: ${interests.join(', ')}.${locCtx}\nReturn JSON array of {interest, content, sources[], category}.`;
  const { content } = await chatCompletion({
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });
  try {
    const parsed = JSON.parse(content);
    const updates = Array.isArray(parsed) ? parsed : parsed.updates || parsed.items || [];
    await db.collection('daily_brief_cache').doc(`${uid}_${today}`).set({
      user_id: uid, date: today, updates, created_at: new Date().toISOString(),
    });
    return { updates };
  } catch {
    return { updates: [], error: 'parse_failed' };
  }
});

/** ai-smart-replies — three short reply suggestions for a chat. */
export const aiSmartReplies = onCall({ secrets: SECRETS }, async (request) => {
  requireAuth(request);
  const { lastMessage, context } = (request.data || {}) as { lastMessage?: string; context?: string };
  if (!lastMessage) throw new HttpsError('invalid-argument', 'lastMessage required');
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: 'Generate exactly 3 short (under 8 words) casual reply suggestions. Return JSON: {"replies":["…","…","…"]}.' },
      { role: 'user', content: `Last message: ${lastMessage}\nContext: ${context || ''}` },
    ],
    response_format: { type: 'json_object' },
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
  requireAuth(request);
  const { text, mode = 'improve', targetLang } = (request.data || {}) as { text?: string; mode?: string; targetLang?: string };
  if (!text) throw new HttpsError('invalid-argument', 'text required');
  const prompt = mode === 'translate'
    ? `Translate to ${targetLang || 'English'}: ${text}`
    : mode === 'shorten' ? `Shorten without losing meaning: ${text}`
    : mode === 'formal' ? `Rewrite formally: ${text}`
    : `Improve clarity & tone: ${text}`;
  const { content } = await chatCompletion({ messages: [{ role: 'user', content: prompt }] });
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

/** ai-safety-scan / scan-content-safety — light moderation. */
export const aiSafetyScan = onCall({ secrets: SECRETS }, async (request) => {
  requireAuth(request);
  const { text } = (request.data || {}) as { text?: string };
  if (!text) return { safe: true };
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: 'Classify the text. Return JSON {"safe":bool,"categories":[],"reason":""}. Flag hate, sexual minors, self-harm encouragement, doxing.' },
      { role: 'user', content: text },
    ],
    response_format: { type: 'json_object' },
  });
  try { return JSON.parse(content); } catch { return { safe: true }; }
});

export const scanContentSafety = aiSafetyScan;
export const scanVideoSafety = aiSafetyScan;
export const moderateContent = aiSafetyScan;

/** generate-theme / generate-advanced-theme — full VYBE theme JSON for AI Vybe Designer. */
const ADVANCED_THEME_SYSTEM = `You are an elite UI theme designer for VYBE social app.
Return ONLY valid JSON: {"theme":{"colorPrimary":"H S% L%","colorSecondary":"...","colorAccent":"...","bgMain":"...","bgCard":"...","textPrimary":"...","textSecondary":"...","borderRadius":"medium","mode":"dark"|"light","themeName":"creative name","backgroundEffect":"aurora"|"particles"|"none"|"stars","animationSpeed":"normal","animationStyle":"smooth"}}
Use HSL format without hsl() wrapper. Ensure WCAG contrast — text must be readable on backgrounds.`;

export const generateTheme = onCall({ secrets: SECRETS }, async (request) => {
  requireAuth(request);
  const {
    prompt,
    interests = [],
    selectedFont,
    selectedAnimation,
  } = (request.data || {}) as {
    prompt?: string;
    interests?: string[];
    selectedFont?: string;
    selectedAnimation?: { speed?: string; style?: string };
  };
  const userPrompt = [
    prompt || 'A calm midnight purple VYBE theme',
    interests.length ? `Interests: ${interests.slice(0, 8).join(', ')}` : '',
    selectedFont ? `Font style: ${selectedFont}` : '',
    selectedAnimation ? `Animation: ${JSON.stringify(selectedAnimation)}` : '',
  ].filter(Boolean).join('\n');

  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: ADVANCED_THEME_SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  });
  try {
    const parsed = JSON.parse(content);
    const theme = parsed.theme || parsed;
    if (theme && (theme.colorPrimary || theme.primary)) {
      return { theme };
    }
  } catch { /* fall through */ }
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

/** generate-background — image. */
export const generateBackground = onCall({ secrets: SECRETS, timeoutSeconds: 60 }, async (request) => {
  requireAuth(request);
  const { prompt } = (request.data || {}) as { prompt?: string };
  const url = await generateImage(prompt || 'abstract neon gradient backdrop');
  return { url };
});

/** generate-caption — caption a post. */
export const generateCaption = onCall({ secrets: SECRETS }, async (request) => {
  requireAuth(request);
  const { description, vibe } = (request.data || {}) as { description?: string; vibe?: string };
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: 'Write 3 short post captions (max 120 chars each). Return JSON {captions:[]}.' },
      { role: 'user', content: `${description || ''} — vibe: ${vibe || 'casual'}` },
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

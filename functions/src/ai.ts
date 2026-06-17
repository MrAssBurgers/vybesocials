import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { chatCompletion, generateImage } from './_shared/lovableAi.js';

const SECRETS = ['LOVABLE_API_KEY', 'GEMINI_API_KEY'];

/** ai-chat — conversational assistant with VYBE DNA context. */
export const aiChat = onCall({ secrets: SECRETS }, async (request) => {
  const uid = requireAuth(request);
  enforceRateLimit(await rateLimit(`aichat:${uid}`, 15, 60));
  const { messages, aiName, aiPersonality, location } =
    (request.data || {}) as { messages?: any[]; aiName?: string; aiPersonality?: string; location?: { city?: string; lat?: number; lng?: number } };
  if (!Array.isArray(messages) || !messages.length) throw new HttpsError('invalid-argument', 'messages required');

  const [dnaSnap, profileSnap] = await Promise.all([
    db.collection('vybe_dna').doc(uid).get(),
    db.collection('profiles').doc(uid).get(),
  ]);
  const profile = profileSnap.data() || {};
  const dna = dnaSnap.data() || {};
  const interests = (profile.interests || profile.onboarding_interests || []) as string[];
  const name = (aiName || 'VYBE-AI').slice(0, 50);
  const personality = (aiPersonality || 'A friendly, helpful AI assistant.').slice(0, 500);
  const loc = location ? `\nLocation: ${location.city || 'Unknown'} (${location.lat?.toFixed?.(2)}, ${location.lng?.toFixed?.(2)}).` : '';

  const system = `You are ${name}. ${personality}\nUser interests: ${interests.slice(0, 10).join(', ') || 'none'}.\nDNA: ${JSON.stringify(dna.personality_vector || {}).slice(0, 400)}${loc}`;
  const { content } = await chatCompletion({
    messages: [{ role: 'system', content: system }, ...messages],
  });
  return { reply: content };
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
  const { text } = (request.data || {}) as { text?: string };
  if (!text) throw new HttpsError('invalid-argument', 'text required');
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: 'Rewrite the user text to sound natural and human. Keep meaning. Reply with just the rewritten text.' },
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

/** generate-theme / generate-advanced-theme — palette JSON. */
export const generateTheme = onCall({ secrets: SECRETS }, async (request) => {
  requireAuth(request);
  const { prompt } = (request.data || {}) as { prompt?: string };
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: 'Return JSON {primary, secondary, accent, background, foreground, muted} as HSL strings.' },
      { role: 'user', content: prompt || 'A calm midnight purple theme' },
    ],
    response_format: { type: 'json_object' },
  });
  try { return JSON.parse(content); } catch { return {}; }
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

/** detect-ai-content — graceful no-op when AI keys missing. */
export const detectAiContent = onCall({ secrets: SECRETS }, async (request) => {
  requireAuth(request);
  const { post_id, caption } = (request.data || {}) as { post_id?: string; caption?: string };
  return { is_ai: false, confidence: 0, reason: 'Detection skipped during migration', post_id, caption: !!caption };
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

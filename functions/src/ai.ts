import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { chatCompletion, generateImage, groundedColorResearchStructured, type ResearchedPalette } from './_shared/geminiAi.js';
import { modelForTier, TOKEN_BUDGET } from './_shared/aiModels.js';
import {
  enforceAiQuota,
  getGeminiByokKey,
  recordSuccessfulAiUsage,
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
export const aiChat = onCall(
  {
    secrets: SECRETS,
    // Gen2 callables must allow unauthenticated Cloud Run ingress; Firebase Auth
    // is enforced inside requireAuth. Empty IAM invokers caused QA ref 8023B65E.
    invoker: 'public',
  },
  async (request) => {
  const authUid = requireAuth(request);
  enforceRateLimit(await rateLimit(`aichat:${authUid}`, 12, 60));
  const profileId = await resolveProfileIdFromAuth(authUid);
  const usePersonalKey = Boolean((request.data as { usePersonalKey?: boolean })?.usePersonalKey);
  const byokKey = usePersonalKey ? await getGeminiByokKey(profileId, authUid) : undefined;
  const usingByok = !!byokKey;
  console.info('[aiChat] start', {
    profileId,
    hasByok: usingByok,
    usePersonalKey,
    keySource: usingByok ? 'byok' : 'platform',
    authUid,
  });
  await enforceAiQuota(profileId, 'chat', {
    ignoreByok: !usePersonalKey,
    consume: false,
  });

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
      model: modelForTier('standard'),
      max_tokens: TOKEN_BUDGET.chat,
      temperature: 0.75,
      apiKey: byokKey,
      usingByok,
    });
    if (!content?.trim()) {
      throw new HttpsError('unavailable', 'AI returned an empty reply — try Clear Chat and send again.');
    }
    const quota = await recordSuccessfulAiUsage(profileId, 'chat', {
      ignoreByok: !usePersonalKey,
    });
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
    const byokKey = await getGeminiByokKey(profileId, authUid);
    const { content } = await chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      model: modelForTier('micro'),
      max_tokens: TOKEN_BUDGET.standard,
      apiKey: byokKey,
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
  const byokKey = await getGeminiByokKey(profileId, authUid);
  await enforceAiQuota(profileId, 'smart_replies');

  const { lastMessage, context } = (request.data || {}) as { lastMessage?: string; context?: string };
  if (!lastMessage) throw new HttpsError('invalid-argument', 'lastMessage required');
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: 'Generate exactly 3 short (under 8 words) casual reply suggestions. Return JSON: {"replies":["…","…","…"]}.' },
      { role: 'user', content: `Last message: ${lastMessage}\nContext: ${context || ''}` },
    ],
    response_format: { type: 'json_object' },
    model: modelForTier('micro'),
    max_tokens: TOKEN_BUDGET.short,
    temperature: 0.6,
    apiKey: byokKey,
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
    model: modelForTier('micro'),
    max_tokens: TOKEN_BUDGET.short,
  });
  try { return JSON.parse(content); } catch { return { comments: [] }; }
});

/** ai-message-assist — rewrite/translate/tone-adjust. */
export const aiMessageAssist = onCall({ secrets: SECRETS }, async (request) => {
  const authUid = requireAuth(request);
  enforceRateLimit(await rateLimit(`aiassist:${authUid}`, 20, 60));
  const profileId = await resolveProfileIdFromAuth(authUid);
  const byokKey = await getGeminiByokKey(profileId, authUid);
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
    model: modelForTier('micro'),
    max_tokens: TOKEN_BUDGET.standard,
    temperature: 0.5,
    apiKey: byokKey,
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
    model: modelForTier('micro'),
    max_tokens: TOKEN_BUDGET.standard,
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
    model: modelForTier('micro'),
    max_tokens: TOKEN_BUDGET.summary,
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
    model: modelForTier('micro'),
    max_tokens: TOKEN_BUDGET.micro,
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
The user's PRIMARY REQUEST (especially "Primary request (match literally):" line) is the main instruction — match it literally. Do not substitute a generic purple, dark, or default palette unless they asked for it.
When the user names a brand, franchise, sports team, app, or aesthetic — match their REAL official colors and mood as closely as possible (e.g. Nike = black/white/orange, Spotify = #1DB954 green, Coca-Cola = red/white, Tiffany = robin-egg blue).
When they describe a scene or vibe (sunset beach, cyberpunk Tokyo, cozy coffee shop) — derive a cohesive palette from that scene's dominant colors.
When a "VERIFIED COLOR RESEARCH" block is included — it contains the factual, looked-up colors of the request. Base the palette on those exact colors (convert hex to HSL triplets); do not invent different ones.
When a "What VYBE knows about this user" block is included — use it to personalize accents and naming, but never override the user's explicit color or mood request.
Return ONLY valid JSON: {"theme":{"colorPrimary":"330 100% 50%","colorSecondary":"280 60% 40%","colorAccent":"45 100% 60%","bgMain":"240 12% 8%","bgCard":"240 10% 14%","textPrimary":"0 0% 96%","textSecondary":"240 8% 70%","borderColor":"240 10% 24%","borderRadius":"medium","mode":"dark"|"light","themeName":"creative name","backgroundEffect":"aurora"|"particles"|"none"|"stars"|"bubbles","animationSpeed":"normal","animationStyle":"smooth"}}
Every color must be a bare HSL triplet exactly like "330 100% 50%" (hue 0-360, saturation %, lightness %) — no hsl() wrapper, no letters, no hex. The example colors above are only format samples; pick colors that match the request. Ensure WCAG contrast — text must be readable on backgrounds.`;

function parseJsonObject<T>(raw: string): T | null {
  const trimmed = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try { return JSON.parse(trimmed) as T; } catch {}
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(trimmed.slice(start, end + 1)) as T; } catch { return null; }
}

const HSL_RE = /^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/;

const THEME_COLOR_KEYS = [
  'colorPrimary',
  'colorSecondary',
  'colorAccent',
  'bgMain',
  'bgCard',
  'textPrimary',
  'textSecondary',
  'borderColor',
] as const;

function hexToHslTriplet(hex: string): string {
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/** Coerce near-miss color formats — "hsl(325, 85%, 50%)", "H 325 S 85% L 50%", "#ff2d78" — into bare HSL triplets. */
function normalizeThemeColor(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  if (HSL_RE.test(v)) return v;
  const hex = v.match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (hex) return hexToHslTriplet(hex[1]!);
  const cleaned = v.replace(/^hsla?\(/i, '').replace(/\)$/, '').replace(/,/g, ' ');
  const m = cleaned.match(/^h?\s*(\d{1,3})(?:deg)?\s+s?\s*(\d{1,3})%?\s+l?\s*(\d{1,3})%?/i);
  if (m) return `${m[1]} ${m[2]}% ${m[3]}%`;
  return value;
}

function normalizeThemeColors(theme: Record<string, unknown>): Record<string, unknown> {
  const out = { ...theme };
  for (const key of THEME_COLOR_KEYS) {
    if (key in out) out[key] = normalizeThemeColor(out[key]);
  }
  return out;
}

function parseHslParts(hsl: string): { h: number; s: number; l: number } | null {
  const m = hsl.match(/^(\d{1,3})\s+(\d{1,3})%\s+(\d{1,3})%$/);
  if (!m) return null;
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

function adjustHslLightness(hsl: string, delta: number): string {
  const parts = parseHslParts(hsl);
  if (!parts) return hsl;
  const l = Math.max(0, Math.min(100, parts.l + delta));
  return `${parts.h} ${parts.s}% ${l}%`;
}

function pickColorByRole(palette: ResearchedPalette, role: ResearchedPalette['colors'][number]['role']): string | null {
  const hit = palette.colors.find((c) => c.role === role);
  return hit?.hex || null;
}

/** Map every researched hex color into theme slots — no AI reinterpretation. */
function buildThemeFromResearchedPalette(palette: ResearchedPalette, subject: string): Record<string, unknown> {
  const hexes = palette.colors
    .map((c) => {
      const m = c.hex.trim().match(/^#?([0-9a-f]{6})$/i);
      return m ? `#${m[1]!.toUpperCase()}` : null;
    })
    .filter((h): h is string => Boolean(h));
  const uniqueHexes = [...new Set(hexes)];

  const withMeta = uniqueHexes.map((hex) => {
    const hsl = hexToHslTriplet(hex.slice(1));
    const parts = parseHslParts(hsl)!;
    return { hex, hsl, ...parts };
  });

  const byLightness = [...withMeta].sort((a, b) => a.l - b.l);
  const darkest = byLightness[0]!;
  const lightest = byLightness[byLightness.length - 1]!;
  const chromatic = withMeta.filter((c) => c.s > 8 && c.l > 4 && c.l < 96);

  const isLightHex = (hex: string) => (parseHslParts(hexToHslTriplet(hex.slice(1)))?.l ?? 50) > 85;
  const isDarkHex = (hex: string) => (parseHslParts(hexToHslTriplet(hex.slice(1)))?.l ?? 50) < 22;

  const hasDarkSurface =
    palette.colors.some((c) => c.role === 'background' && isDarkHex(c.hex)) ||
    byLightness.some((c) => c.l < 22);
  const inferredMode: 'dark' | 'light' =
    hasDarkSurface || (darkest.l < 25 && lightest.l > 75)
      ? 'dark'
      : lightest.l > 80 && darkest.l > 28
        ? 'light'
        : palette.mode === 'light'
          ? 'light'
          : 'dark';
  const mode = inferredMode;


  const primaryHex =
    pickColorByRole(palette, 'primary') ||
    chromatic[chromatic.length - 1]?.hex ||
    withMeta[0]!.hex;
  const secondaryHex =
    pickColorByRole(palette, 'secondary') ||
    chromatic.find((c) => c.hex !== primaryHex)?.hex ||
    withMeta[1]?.hex ||
    primaryHex;

  let bgHex =
    pickColorByRole(palette, 'background') ||
    byLightness.find((c) => isDarkHex(c.hex))?.hex ||
    (mode === 'light' ? lightest.hex : darkest.hex);
  if (mode === 'dark' && isLightHex(bgHex)) {
    bgHex = byLightness.find((c) => isDarkHex(c.hex))?.hex || darkest.hex;
  }
  if (mode === 'light' && isDarkHex(bgHex) && lightest.l > 80) {
    bgHex = lightest.hex;
  }

  const usedForSlots = new Set([primaryHex, secondaryHex, bgHex]);

  const accentHex =
    pickColorByRole(palette, 'accent') ||
    withMeta.find((c) => !usedForSlots.has(c.hex) && c.s > 12 && (mode === 'dark' ? c.l > 55 : c.l < 55))?.hex ||
    withMeta.find((c) => !usedForSlots.has(c.hex) && c.s > 12)?.hex ||
    (mode === 'dark' ? lightest.hex : darkest.hex);
  usedForSlots.add(accentHex);

  const borderHex =
    withMeta.find((c) => !usedForSlots.has(c.hex))?.hex ||
    pickColorByRole(palette, 'neutral') ||
    secondaryHex;

  const colorPrimary = hexToHslTriplet(primaryHex.slice(1));
  const colorSecondary = hexToHslTriplet(secondaryHex.slice(1));
  const colorAccent = hexToHslTriplet(accentHex.slice(1));
  const bgMain = hexToHslTriplet(bgHex.slice(1));
  const bgCard = adjustHslLightness(bgMain, mode === 'dark' ? 6 : -4);
  const borderColor = hexToHslTriplet(borderHex.slice(1));
  const textPrimary =
    mode === 'dark'
      ? hexToHslTriplet(lightest.hex.slice(1))
      : hexToHslTriplet(darkest.hex.slice(1));
  const textSecondary = adjustHslLightness(textPrimary, mode === 'dark' ? -28 : 28);

  const themeName = subject
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .slice(0, 40) || 'Custom VYBE';

  return {
    colorPrimary,
    colorSecondary,
    colorAccent,
    bgMain,
    bgCard,
    textPrimary,
    textSecondary,
    borderColor,
    borderRadius: 'medium',
    mode,
    themeName,
    backgroundEffect: 'aurora',
    animationSpeed: 'normal',
    animationStyle: 'smooth',
  };
}

function formatResearchedPaletteBlock(palette: ResearchedPalette): string {
  return palette.colors
    .map((c) => `- ${c.name}: ${c.hex}${c.role ? ` (${c.role})` : ''}`)
    .join('\n');
}

function validTheme(theme: unknown): theme is Record<string, unknown> {
  return Boolean(
    theme &&
      typeof theme === 'object' &&
      typeof (theme as Record<string, unknown>).colorPrimary === 'string' &&
      HSL_RE.test((theme as Record<string, string>).colorPrimary),
  );
}

function fallbackThemeFromPrompt(prompt: string): Record<string, unknown> {
  const p = prompt.toLowerCase();
  const pick = (name: string, primary: string, secondary: string, accent: string, mode: 'dark' | 'light' = 'dark') => ({
    colorPrimary: primary,
    colorSecondary: secondary,
    colorAccent: accent,
    bgMain: mode === 'light' ? '0 0% 98%' : '225 25% 7%',
    bgCard: mode === 'light' ? '0 0% 100%' : '225 22% 12%',
    textPrimary: mode === 'light' ? '224 24% 10%' : '0 0% 98%',
    textSecondary: mode === 'light' ? '224 10% 38%' : '220 12% 72%',
    borderColor: mode === 'light' ? '220 13% 88%' : '220 18% 22%',
    borderRadius: 'medium',
    mode,
    themeName: name,
    backgroundEffect: 'aurora',
    animationSpeed: 'normal',
    animationStyle: 'smooth',
  });
  if (/spotify/.test(p)) return pick('Spotify VYBE', '141 73% 42%', '145 63% 28%', '0 0% 100%');
  if (/nike|adidas|apple|monochrome|black\s+and\s+white/.test(p)) return pick('Monochrome VYBE', '0 0% 96%', '0 0% 12%', '24 100% 55%');
  if (/coca|coke|youtube|netflix|red/.test(p)) return pick('Crimson VYBE', '0 84% 50%', '0 70% 36%', '42 100% 58%');
  if (/tiffany|aqua|teal|ocean|beach/.test(p)) return pick('Aqua VYBE', '178 68% 52%', '199 89% 56%', '32 95% 55%');
  if (/sunset|orange|gold|amber/.test(p)) return pick('Sunset VYBE', '28 96% 56%', '335 82% 57%', '48 100% 62%');
  if (/forest|green|nature/.test(p)) return pick('Forest VYBE', '152 65% 45%', '120 36% 28%', '82 72% 54%');
  if (/pink|rose|barbie/.test(p)) return pick('Rose VYBE', '330 80% 66%', '300 72% 54%', '24 100% 70%');
  // Hash leftover prompts into a non-purple hue so server fallbacks aren't always violet.
  let hash = 0;
  for (let i = 0; i < p.length; i++) hash = (hash * 33 + p.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  const accent = (hue + 48) % 360;
  return pick('Custom VYBE', `${hue} 72% 58%`, `${accent} 68% 52%`, `${(hue + 180) % 360} 70% 60%`);
}

function formatServerThemeContext(input: {
  profile: Record<string, unknown>;
  dna: Record<string, unknown>;
  clientContext?: Record<string, unknown>;
}): string {
  const { profile, dna, clientContext } = input;
  const lines: string[] = ['What VYBE knows about this user (personalize the theme to match):'];

  const username = typeof profile.username === 'string' ? profile.username : '';
  const displayName =
    typeof profile.display_name === 'string'
      ? profile.display_name
      : typeof profile.displayName === 'string'
        ? profile.displayName
        : '';
  if (displayName || username) {
    lines.push(`- Name: ${displayName || username}${username ? ` (@${username})` : ''}`);
  }

  const bio = typeof profile.bio === 'string' ? profile.bio.trim() : '';
  if (bio) lines.push(`- Bio: ${bio.slice(0, 280)}`);

  const interestsRaw = profile.interests ?? profile.onboarding_interests ?? dna.interests ?? [];
  const interests = (Array.isArray(interestsRaw) ? interestsRaw : [])
    .map((v) => (typeof v === 'string' ? v : String(v ?? '')))
    .filter(Boolean)
    .slice(0, 10);
  if (interests.length) lines.push(`- Interests: ${interests.join(', ')}`);

  const signatureColors = Array.isArray(dna.signature_colors) ? dna.signature_colors : [];
  if (signatureColors.length) {
    lines.push(`- Vybe DNA signature colors: ${signatureColors.slice(0, 4).join(', ')}`);
  }
  if (typeof dna.glyph_pattern === 'string' && dna.glyph_pattern) {
    lines.push(`- Vybe DNA visual pattern: ${dna.glyph_pattern}`);
  }
  const pv = (dna.personality_vector ?? {}) as Record<string, number>;
  if (pv && typeof pv === 'object' && Object.keys(pv).length) {
    const traits = Object.entries(pv)
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .slice(0, 5)
      .map(([k, v]) => `${k} ${Math.round((v ?? 0) * 100)}%`)
      .join(', ');
    lines.push(`- Personality mix: ${traits}`);
  }

  const cc = clientContext || {};
  if (typeof cc.currentThemeName === 'string' && cc.currentThemeName) {
    lines.push(
      `- Current equipped theme: ${cc.currentThemeName} (primary ${cc.currentPrimary || '?'}, accent ${cc.currentAccent || '?'})`,
    );
  }

  return lines.length > 1 ? lines.join('\n') : '';
}

export const generateTheme = onCall({ secrets: SECRETS }, async (request) => {
  const authUid = requireAuth(request);
  enforceRateLimit(await rateLimit(`gentheme:${authUid}`, 12, 60));
  const profileId = await resolveProfileIdFromAuth(authUid);
  const byokKey = await getGeminiByokKey(profileId, authUid);

  const {
    prompt,
    typedPrompt,
    basePreset,
    interests = [],
    selectedFont,
    selectedAnimation,
    userContext: clientContext,
  } = (request.data || {}) as {
    prompt?: string;
    typedPrompt?: string;
    basePreset?: string;
    interests?: string[];
    selectedFont?: string;
    selectedAnimation?: { speed?: string; style?: string };
    userContext?: Record<string, unknown>;
  };

  const typed = typeof typedPrompt === 'string' ? typedPrompt.trim() : '';

  // Look up the REAL colors of what the user named via Google-Search-grounded
  // Gemini (runs in parallel with profile loads; skipped when nothing typed).
  const [profile, dnaSnap, researchedPalette] = await Promise.all([
    loadUserProfile(authUid),
    db.collection('vybe_dna').doc(profileId).get(),
    typed ? groundedColorResearchStructured(typed, { apiKey: byokKey }) : Promise.resolve(null),
  ]);
  const dna = (dnaSnap.data() || {}) as Record<string, unknown>;
  const contextBlock = formatServerThemeContext({
    profile,
    dna,
    clientContext: clientContext as Record<string, unknown> | undefined,
  });

  // When lookup finds 2+ real colors, map them deterministically into every
  // theme slot so all researched colors appear (no AI reinterpretation).
  if (researchedPalette && researchedPalette.colors.length >= 2) {
    const exactTheme = buildThemeFromResearchedPalette(researchedPalette, typed);
    if (validTheme(exactTheme)) {
      try {
        const { content } = await chatCompletion({
          messages: [
            {
              role: 'system',
              content:
                'Name this UI theme in 2-4 words. Return ONLY JSON: {"themeName":"...","backgroundEffect":"aurora"|"particles"|"none"|"stars"|"bubbles"}',
            },
            { role: 'user', content: `Subject: ${typed}` },
          ],
          response_format: { type: 'json_object' },
          model: modelForTier('micro'),
          max_tokens: TOKEN_BUDGET.short,
          apiKey: byokKey,
        });
        const naming = parseJsonObject<{ themeName?: string; backgroundEffect?: string }>(content);
        if (naming?.themeName) exactTheme.themeName = String(naming.themeName).slice(0, 48);
        const fx = naming?.backgroundEffect;
        if (fx === 'aurora' || fx === 'particles' || fx === 'none' || fx === 'stars' || fx === 'bubbles') {
          exactTheme.backgroundEffect = fx;
        }
      } catch {
        // naming is optional — exact colors are what matter
      }
      return { theme: exactTheme, researched: true };
    }
  }

  const colorResearch = researchedPalette ? formatResearchedPaletteBlock(researchedPalette) : null;

  const userPrompt = [
    typed
      ? `PRIMARY REQUEST (match literally — this overrides any generic palette): ${typed}`
      : prompt || 'Design a personalized VYBE theme based on what you know about me.',
    colorResearch
      ? `VERIFIED COLOR RESEARCH (live web lookup — treat these as the true colors of the request; build the palette from them, converting hex to HSL):\n${colorResearch}`
      : '',
    typed && prompt && prompt !== typed ? `Additional context:\n${prompt}` : '',
    contextBlock,
    basePreset ? `Base preset: ${basePreset}` : '',
    interests.length ? `Interests: ${interests.slice(0, 8).join(', ')}` : '',
    selectedFont ? `Font style: ${selectedFont}` : '',
    selectedAnimation ? `Animation: ${JSON.stringify(selectedAnimation)}` : '',
  ].filter(Boolean).join('\n\n');

  try {
    const themeTier = typed ? 'creative' : 'micro';
    const { content } = await chatCompletion({
      messages: [
        { role: 'system', content: ADVANCED_THEME_SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      model: modelForTier(themeTier),
      max_tokens: typed ? TOKEN_BUDGET.creative : TOKEN_BUDGET.standard,
      apiKey: byokKey,
    });
    const parsed = parseJsonObject<{ theme?: Record<string, unknown> } & Record<string, unknown>>(content);
    const rawTheme = parsed?.theme || parsed;
    if (rawTheme && typeof rawTheme === 'object') {
      const theme = normalizeThemeColors(rawTheme as Record<string, unknown>);
      if (validTheme(theme)) return { theme };
    }
    console.warn('[generateTheme] AI returned non-theme JSON; using prompt fallback', { len: content?.length || 0 });
  } catch (err) {
    console.error('[generateTheme]', err);
    // Theme generation should never hard-fail the settings page. If the model,
    // key, or JSON formatter misbehaves, return a deterministic prompt-matched
    // theme and let the client keep moving.
  }

  return { theme: fallbackThemeFromPrompt(userPrompt), fallback: true };
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
    model: modelForTier('micro'),
    max_tokens: TOKEN_BUDGET.short,
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
    model: modelForTier('standard'),
    max_tokens: TOKEN_BUDGET.short,
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
    model: modelForTier('standard'),
    max_tokens: TOKEN_BUDGET.chat,
  });
  return { reply: content };
});

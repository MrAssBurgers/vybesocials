import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db, requireAuth, rateLimit, enforceRateLimit } from './_shared/admin.js';
import { chatCompletion, generateImage } from './_shared/geminiAi.js';
import { modelForTier, TOKEN_BUDGET } from './_shared/aiModels.js';
import { enforceAiQuota, getGeminiByokKey, resolveProfileIdFromAuth, } from './_shared/aiQuota.js';
import { runVybeCheckScan } from './_shared/contentSafety.js';
const SECRETS = ['GEMINI_API_KEY'];
async function loadUserProfile(uid) {
    const direct = await db.collection('profiles').doc(uid).get();
    if (direct.exists)
        return (direct.data() || {});
    const byUserId = await db.collection('profiles').where('user_id', '==', uid).limit(1).get();
    return (byUserId.docs[0]?.data() || {});
}
/** ai-chat — conversational assistant with VYBE DNA context. */
export const aiChat = onCall({ secrets: SECRETS }, async (request) => {
    const authUid = requireAuth(request);
    enforceRateLimit(await rateLimit(`aichat:${authUid}`, 12, 60));
    const profileId = await resolveProfileIdFromAuth(authUid);
    const usePersonalKey = Boolean(request.data?.usePersonalKey);
    const byokKey = usePersonalKey ? await getGeminiByokKey(profileId, authUid) : undefined;
    const usingByok = !!byokKey;
    console.info('[aiChat] start', {
        profileId,
        hasByok: usingByok,
        usePersonalKey,
        keySource: usingByok ? 'byok' : 'platform',
        authUid,
    });
    const quota = await enforceAiQuota(profileId, 'chat', { ignoreByok: !usePersonalKey });
    const { messages, aiName, aiPersonality, location, imageBase64, imageMimeType } = (request.data || {});
    if (!Array.isArray(messages) || !messages.length)
        throw new HttpsError('invalid-argument', 'messages required');
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
        }
        catch {
            dnaSnippet = '';
        }
        const system = `You are ${name}. ${personality}\nUser interests: ${interests.join(', ') || 'none'}.\nDNA: ${dnaSnippet}${loc}`;
        const sanitized = messages
            .filter((m) => m && typeof m.content === 'string' && m.content.trim())
            .slice(-16)
            .map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: String(m.content).slice(0, 3000),
        }));
        const imgB64 = typeof imageBase64 === 'string' ? imageBase64.slice(0, 2_500_000) : '';
        const imgMime = typeof imageMimeType === 'string' ? imageMimeType.slice(0, 64) : '';
        let chatMessages = [
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
        return {
            reply: content,
            quota: {
                chat: quota.chat,
                hasByok: quota.hasByok,
                isPremium: quota.isPremium,
            },
        };
    }
    catch (err) {
        if (err instanceof HttpsError)
            throw err;
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
    const { latitude, longitude } = (request.data || {});
    const profile = await loadUserProfile(authUid);
    const prefsSnap = await db.collection('ai_brief_preferences').doc(profileId).get();
    const prefs = prefsSnap.data() || {};
    const onboardingInterests = (profile.interests || profile.onboarding_interests || []);
    const customTopics = prefs.custom_topics || [];
    const interests = customTopics.length || onboardingInterests.length
        ? [...new Set([...customTopics, ...onboardingInterests])].slice(0, 7)
        : ['technology', 'pop culture', 'breaking news'];
    const today = new Date().toISOString().split('T')[0];
    const locCtx = latitude && longitude
        ? `\nInclude one local item near ${latitude.toFixed(2)}, ${longitude.toFixed(2)}.`
        : '';
    const prompt = `Today is ${today}. Return JSON: {"items":[{"topic":"…","summary":"…","sources":["url"],"category":"interests|local|world"}]}\nTopics: ${interests.join(', ')}.${locCtx}`;
    let liveUpdates = [];
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
        liveUpdates = items.map((item) => ({
            interest: String(item.topic || item.interest || 'News'),
            content: String(item.summary || item.content || ''),
            sources: Array.isArray(item.sources) ? item.sources.map(String).filter((u) => u.startsWith('http')) : [],
            category: item.category ? String(item.category) : 'interests',
        }));
    }
    catch (e) {
        console.warn('[aiCatchUp] news generation failed:', e);
    }
    const userName = String(profile.display_name || profile.username || 'there');
    const parts = [];
    if (liveUpdates.length)
        parts.push(`${liveUpdates.length} trending topics`);
    const summary = parts.length > 0
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
    const { lastMessage, context } = (request.data || {});
    if (!lastMessage)
        throw new HttpsError('invalid-argument', 'lastMessage required');
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
    try {
        return JSON.parse(content);
    }
    catch {
        return { replies: [] };
    }
});
/** ai-comment-suggestions — comment ideas for a post. */
export const aiCommentSuggestions = onCall({ secrets: SECRETS }, async (request) => {
    requireAuth(request);
    const { postCaption, postType } = (request.data || {});
    const { content } = await chatCompletion({
        messages: [
            { role: 'system', content: 'Suggest 4 short authentic comments. Return JSON: {"comments":["…",…]}.' },
            { role: 'user', content: `Post (${postType || 'post'}): ${postCaption || '(no caption)'}` },
        ],
        response_format: { type: 'json_object' },
        model: modelForTier('micro'),
        max_tokens: TOKEN_BUDGET.short,
    });
    try {
        return JSON.parse(content);
    }
    catch {
        return { comments: [] };
    }
});
/** ai-message-assist — rewrite/translate/tone-adjust. */
export const aiMessageAssist = onCall({ secrets: SECRETS }, async (request) => {
    const authUid = requireAuth(request);
    enforceRateLimit(await rateLimit(`aiassist:${authUid}`, 20, 60));
    const profileId = await resolveProfileIdFromAuth(authUid);
    const byokKey = await getGeminiByokKey(profileId, authUid);
    await enforceAiQuota(profileId, 'assist');
    const { text, mode = 'improve', targetLang } = (request.data || {});
    if (!text)
        throw new HttpsError('invalid-argument', 'text required');
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
    const { text, tone } = (request.data || {});
    if (!text)
        throw new HttpsError('invalid-argument', 'text required');
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
    const { messages } = (request.data || {});
    if (!messages?.length)
        throw new HttpsError('invalid-argument', 'messages required');
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
    const { interests = [], vibe = 'fun' } = (request.data || {});
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
    const body = (request.data || {});
    const hasPayload = body.image_base64 ||
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
    }
    catch (err) {
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
When a "What VYBE knows about this user" block is included — use it to personalize accents and naming, but never override the user's explicit color or mood request.
Return ONLY valid JSON: {"theme":{"colorPrimary":"H S% L%","colorSecondary":"...","colorAccent":"...","bgMain":"...","bgCard":"...","textPrimary":"...","textSecondary":"...","borderColor":"...","borderRadius":"medium","mode":"dark"|"light","themeName":"creative name","backgroundEffect":"aurora"|"particles"|"none"|"stars"|"bubbles","animationSpeed":"normal","animationStyle":"smooth"}}
Use HSL format without hsl() wrapper. Ensure WCAG contrast — text must be readable on backgrounds.`;
function parseJsonObject(raw) {
    const trimmed = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    try {
        return JSON.parse(trimmed);
    }
    catch { }
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start < 0 || end <= start)
        return null;
    try {
        return JSON.parse(trimmed.slice(start, end + 1));
    }
    catch {
        return null;
    }
}
const HSL_RE = /^\d{1,3}\s+\d{1,3}%\s+\d{1,3}%$/;
function validTheme(theme) {
    return Boolean(theme &&
        typeof theme === 'object' &&
        typeof theme.colorPrimary === 'string' &&
        HSL_RE.test(theme.colorPrimary));
}
function fallbackThemeFromPrompt(prompt) {
    const p = prompt.toLowerCase();
    const pick = (name, primary, secondary, accent, mode = 'dark') => ({
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
    if (/spotify/.test(p))
        return pick('Spotify VYBE', '141 73% 42%', '145 63% 28%', '0 0% 100%');
    if (/nike|adidas|apple|monochrome|black\s+and\s+white/.test(p))
        return pick('Monochrome VYBE', '0 0% 96%', '0 0% 12%', '24 100% 55%');
    if (/coca|coke|youtube|netflix|red/.test(p))
        return pick('Crimson VYBE', '0 84% 50%', '0 70% 36%', '42 100% 58%');
    if (/tiffany|aqua|teal|ocean|beach/.test(p))
        return pick('Aqua VYBE', '178 68% 52%', '199 89% 56%', '32 95% 55%');
    if (/sunset|orange|gold|amber/.test(p))
        return pick('Sunset VYBE', '28 96% 56%', '335 82% 57%', '48 100% 62%');
    if (/forest|green|nature/.test(p))
        return pick('Forest VYBE', '152 65% 45%', '120 36% 28%', '82 72% 54%');
    if (/pink|rose|barbie/.test(p))
        return pick('Rose VYBE', '330 80% 66%', '300 72% 54%', '24 100% 70%');
    return pick('Custom VYBE', '270 85% 65%', '199 89% 56%', '330 100% 60%');
}
function formatServerThemeContext(input) {
    const { profile, dna, clientContext } = input;
    const lines = ['What VYBE knows about this user (personalize the theme to match):'];
    const username = typeof profile.username === 'string' ? profile.username : '';
    const displayName = typeof profile.display_name === 'string'
        ? profile.display_name
        : typeof profile.displayName === 'string'
            ? profile.displayName
            : '';
    if (displayName || username) {
        lines.push(`- Name: ${displayName || username}${username ? ` (@${username})` : ''}`);
    }
    const bio = typeof profile.bio === 'string' ? profile.bio.trim() : '';
    if (bio)
        lines.push(`- Bio: ${bio.slice(0, 280)}`);
    const interestsRaw = profile.interests ?? profile.onboarding_interests ?? dna.interests ?? [];
    const interests = (Array.isArray(interestsRaw) ? interestsRaw : [])
        .map((v) => (typeof v === 'string' ? v : String(v ?? '')))
        .filter(Boolean)
        .slice(0, 10);
    if (interests.length)
        lines.push(`- Interests: ${interests.join(', ')}`);
    const signatureColors = Array.isArray(dna.signature_colors) ? dna.signature_colors : [];
    if (signatureColors.length) {
        lines.push(`- Vybe DNA signature colors: ${signatureColors.slice(0, 4).join(', ')}`);
    }
    if (typeof dna.glyph_pattern === 'string' && dna.glyph_pattern) {
        lines.push(`- Vybe DNA visual pattern: ${dna.glyph_pattern}`);
    }
    const pv = (dna.personality_vector ?? {});
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
        lines.push(`- Current equipped theme: ${cc.currentThemeName} (primary ${cc.currentPrimary || '?'}, accent ${cc.currentAccent || '?'})`);
    }
    return lines.length > 1 ? lines.join('\n') : '';
}
export const generateTheme = onCall({ secrets: SECRETS }, async (request) => {
    const authUid = requireAuth(request);
    enforceRateLimit(await rateLimit(`gentheme:${authUid}`, 12, 60));
    const profileId = await resolveProfileIdFromAuth(authUid);
    const byokKey = await getGeminiByokKey(profileId, authUid);
    const { prompt, typedPrompt, basePreset, interests = [], selectedFont, selectedAnimation, userContext: clientContext, } = (request.data || {});
    const [profile, dnaSnap] = await Promise.all([
        loadUserProfile(authUid),
        db.collection('vybe_dna').doc(profileId).get(),
    ]);
    const dna = (dnaSnap.data() || {});
    const contextBlock = formatServerThemeContext({
        profile,
        dna,
        clientContext: clientContext,
    });
    const typed = typeof typedPrompt === 'string' ? typedPrompt.trim() : '';
    const userPrompt = [
        typed
            ? `PRIMARY REQUEST (match literally — this overrides any generic palette): ${typed}`
            : prompt || 'Design a personalized VYBE theme based on what you know about me.',
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
        const parsed = parseJsonObject(content);
        const theme = parsed?.theme || parsed;
        if (validTheme(theme))
            return { theme };
        console.warn('[generateTheme] AI returned non-theme JSON; using prompt fallback', { len: content?.length || 0 });
    }
    catch (err) {
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
    const { prompt } = (request.data || {});
    const safePrompt = String(prompt || 'abstract neon gradient backdrop').slice(0, 500);
    const url = await generateImage(safePrompt);
    if (!url)
        throw new HttpsError('unavailable', 'Image generation failed — try again');
    return { url, prompt: safePrompt };
});
/** generate-caption — caption a post. */
export const generateCaption = onCall({ secrets: SECRETS }, async (request) => {
    requireAuth(request);
    const { description, vibe, tags, contentType } = (request.data || {});
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
    try {
        return JSON.parse(content);
    }
    catch {
        return { captions: [] };
    }
});
/** detect-ai-content — VYBE Check: is this post AI-generated? */
export const detectAiContent = onCall({ secrets: SECRETS }, async (request) => {
    const uid = requireAuth(request);
    const { post_id, caption, image_base64, mime_type, content_type } = (request.data || {});
    if (!image_base64 && !caption) {
        return { is_ai: false, confidence: 0, reason: 'No content to analyze' };
    }
    if (post_id) {
        const postSnap = await db.collection('posts').doc(post_id).get();
        if (postSnap.exists) {
            const post = postSnap.data();
            if (post.user_id && post.user_id !== uid) {
                const profile = await db.collection('profiles').where('user_id', '==', uid).limit(1).get();
                const ownerOk = post.user_id === uid || profile.docs.some((d) => d.id === post.user_id);
                if (!ownerOk)
                    throw new HttpsError('permission-denied', 'not your post');
            }
        }
    }
    const parts = [
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
    }
    catch { /* keep default */ }
    if (post_id) {
        await db.collection('posts').doc(post_id).set({
            is_ai_generated: !!result.is_ai,
            ai_detection_confidence: result.confidence,
            ai_detection_reason: result.reason,
            ai_checked_at: new Date().toISOString(),
        }, { merge: true });
    }
    return result;
});
/** dna-chat — short DNA-aware AI thread. */
export const dnaChat = onCall({ secrets: SECRETS }, async (request) => {
    const uid = requireAuth(request);
    const { message } = (request.data || {});
    if (!message)
        throw new HttpsError('invalid-argument', 'message required');
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
//# sourceMappingURL=ai.js.map
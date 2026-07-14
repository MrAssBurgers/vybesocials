/**
 * Lighter-weight AI utilities — thin wrappers over Lovable AI Gateway.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAuth, requireAdmin, db } from './_shared/admin.js';
import { chatCompletion } from './_shared/geminiAi.js';
import { modelForTier, TOKEN_BUDGET } from './_shared/aiModels.js';
import { AGENT_NAV_PATHS, AGENT_TOOL_NAME, buildVybeAgentActTool, parseAgentPlan, THEME_PRESET_KEYS, } from './_shared/agentToolSchema.js';
const SECRETS = ['GEMINI_API_KEY'];
function simpleAI(systemPrompt) {
    return onCall({ secrets: SECRETS }, async (request) => {
        requireAuth(request);
        const { input, context } = (request.data || {});
        if (!input)
            throw new HttpsError('invalid-argument', 'input required');
        const { content } = await chatCompletion({
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input) + (context ? `\nContext: ${JSON.stringify(context).slice(0, 600)}` : '') },
            ],
            temperature: 0.5,
            model: modelForTier('micro'),
            max_tokens: TOKEN_BUDGET.standard,
        });
        return { ok: true, content };
    });
}
export const aiAdaptiveResponse = simpleAI('Adapt the user message to match the recipient\'s vibe. Return a short reply.');
export const aiAutoFix = simpleAI('Fix grammar, spelling, and clarity in the user\'s text. Return only the corrected text.');
export const aiEnhancePhoto = simpleAI('Suggest 3 specific photo edits (crop, filter, color) for the described image.');
export const generateChallenges = simpleAI('Generate 5 short creative challenges in JSON array. Each: {"title","description","difficulty"}.');
export const generateCustomAnimations = simpleAI('Suggest 3 CSS keyframe animations matching the description. Return JSON: [{"name","keyframes","duration"}].');
export const generatePwaIcon = simpleAI('Describe a PWA icon concept: 1 line per icon size hint and color palette.');
export const generateArFilter = simpleAI('Design an AR filter: list visual elements, colors, and triggers.');
export const generateAiVideo = onCall({ secrets: SECRETS }, async () => ({
    ok: false, error: 'video_generation_unavailable',
    message: 'AI video generation requires Runway API — configure RUNWAY_API_KEY and use generateRunwayVideo.',
}));
// Admin tools
export const adminAiBuilder = onCall({ secrets: SECRETS }, async (request) => {
    await requireAdmin(request);
    const { prompt } = (request.data || {});
    const { content } = await chatCompletion({
        messages: [
            { role: 'system', content: 'You are an admin assistant for VYBE. Help with operational tasks: SQL hints, user queries, data fixes. Be precise.' },
            { role: 'user', content: prompt || '' },
        ],
        model: modelForTier('standard'),
        max_tokens: TOKEN_BUDGET.creative,
    });
    return { ok: true, content };
});
export const adminDebugTools = onCall(async (request) => {
    await requireAdmin(request);
    const { action } = (request.data || {});
    switch (action) {
        case 'count_users': {
            const snap = await db.collection('profiles').count().get();
            return { ok: true, count: snap.data().count };
        }
        case 'recent_errors': {
            const snap = await db.collection('error_logs').orderBy('created_at', 'desc').limit(20).get();
            return { ok: true, errors: snap.docs.map((d) => ({ id: d.id, ...d.data() })) };
        }
        default:
            return { ok: false, error: 'unknown_action' };
    }
});
export const analyzeBugReport = onCall({ secrets: SECRETS, cors: true }, async (request) => {
    await requireAdmin(request);
    const { report_id, bugId, force, verify, reproAttempted, errorSeenOnRepro, } = (request.data || {});
    const id = report_id || bugId;
    if (!id)
        throw new HttpsError('invalid-argument', 'bugId required');
    const doc = await db.collection('bug_reports').doc(id).get();
    if (!doc.exists)
        throw new HttpsError('not-found', 'Bug report not found');
    const data = doc.data() || {};
    // Verify mode: decide ACTIVE vs RESOLVED (self-heal / AI check active).
    if (verify || force) {
        // If client tried to re-trigger and saw nothing, treat as resolved.
        if (reproAttempted && errorSeenOnRepro === false) {
            await doc.ref.update({
                status: 'fixed',
                ai_analysis: 'Auto-resolved: AI check could not reproduce the error.',
                ai_severity: 'low',
                analyzed_at: new Date().toISOString(),
                resolved_at: new Date().toISOString(),
            });
            return { ok: true, status: 'RESOLVED', content: 'Could not reproduce — marked fixed.' };
        }
        const { content } = await chatCompletion({
            messages: [
                {
                    role: 'system',
                    content: 'You verify whether a VYBE app bug is still ACTIVE or LIKELY_RESOLVED. ' +
                        'Reply with JSON only: {"verdict":"ACTIVE"|"LIKELY_RESOLVED","severity":"low"|"medium"|"high"|"critical","summary":"1-2 sentences"}. ' +
                        'Mark LIKELY_RESOLVED when message looks like a one-off network blip, permission noise during logout, stale cache, or already-handled transient error. ' +
                        'Mark ACTIVE for real product defects still present.',
                },
                {
                    role: 'user',
                    content: JSON.stringify({
                        error_message: data.error_message,
                        page_url: data.page_url,
                        status: data.status,
                        stack: String(data.error_stack || '').slice(0, 1500),
                        existing_analysis: data.ai_analysis,
                        reproAttempted: Boolean(reproAttempted),
                        errorSeenOnRepro,
                    }).slice(0, 4000),
                },
            ],
            response_format: { type: 'json_object' },
            model: modelForTier('micro'),
            max_tokens: TOKEN_BUDGET.standard,
        });
        let verdict = 'ACTIVE';
        let severity = String(data.ai_severity || 'medium');
        let summary = content;
        try {
            const parsed = JSON.parse(content);
            if (parsed.verdict === 'LIKELY_RESOLVED')
                verdict = 'LIKELY_RESOLVED';
            if (parsed.severity)
                severity = parsed.severity;
            if (parsed.summary)
                summary = parsed.summary;
        }
        catch {
            /* keep defaults */
        }
        if (verdict === 'LIKELY_RESOLVED') {
            await doc.ref.update({
                status: 'fixed',
                ai_analysis: summary,
                ai_severity: severity,
                analyzed_at: new Date().toISOString(),
                resolved_at: new Date().toISOString(),
            });
            return { ok: true, status: 'RESOLVED', severity, content: summary };
        }
        await doc.ref.update({
            ai_analysis: summary,
            ai_severity: severity,
            analyzed_at: new Date().toISOString(),
            ...(data.status === 'pending' ? { status: 'reviewing' } : {}),
        });
        return { ok: true, status: 'ACTIVE', severity, content: summary };
    }
    const { content } = await chatCompletion({
        messages: [
            { role: 'system', content: 'Analyze a bug report. Identify likely root cause, severity, and suggested fix. Be concise (3 bullets).' },
            { role: 'user', content: JSON.stringify(data).slice(0, 4000) },
        ],
        model: modelForTier('micro'),
        max_tokens: TOKEN_BUDGET.standard,
    });
    await doc.ref.update({ ai_analysis: content, analyzed_at: new Date().toISOString() });
    return { ok: true, content };
});
export const analyzeError = onCall({ secrets: SECRETS }, async (request) => {
    await requireAdmin(request);
    const { error_message, stack } = (request.data || {});
    const { content } = await chatCompletion({
        messages: [
            { role: 'system', content: 'Diagnose a JS/TS error. Provide likely cause + 1 fix in 3 sentences.' },
            { role: 'user', content: `Error: ${error_message}\n\nStack: ${(stack || '').slice(0, 2000)}` },
        ],
        model: modelForTier('micro'),
        max_tokens: TOKEN_BUDGET.summary,
    });
    return { ok: true, content };
});
// DNA Autopilot
export const dnaAutopilot = onCall({ secrets: SECRETS }, async (request) => {
    const uid = requireAuth(request);
    const settingsSnap = await db.collection('dna_agent_settings').doc(uid).get();
    const mode = settingsSnap.data()?.mode || 'suggest';
    if (mode === 'off')
        return { ok: true, mode: 'off', actions: [] };
    const dnaSnap = await db.collection('vybe_dna').doc(uid).get();
    const { content } = await chatCompletion({
        messages: [
            { role: 'system', content: 'You are the DNA Autopilot. Suggest 3 actions to optimize the user\'s feed/theme/layout based on their DNA. Output JSON: [{"type":"apply_theme|navigate|generate_theme","reason":"..."}].' },
            { role: 'user', content: JSON.stringify(dnaSnap.data() || {}).slice(0, 1500) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.6,
        model: modelForTier('micro'),
        max_tokens: TOKEN_BUDGET.standard,
    });
    let actions = [];
    try {
        actions = JSON.parse(content);
    }
    catch {
        actions = [];
    }
    for (const action of actions) {
        await db.collection('dna_agent_actions').add({
            user_id: uid, action_type: action.type, reason: action.reason,
            mode, status: mode === 'autonomous' ? 'applied' : 'suggested',
            created_at: new Date().toISOString(),
        });
    }
    return { ok: true, mode, actions };
});
export const dnaAutopilotRevert = onCall(async (request) => {
    const uid = requireAuth(request);
    const { action_id } = (request.data || {});
    const doc = await db.collection('dna_agent_actions').doc(action_id).get();
    if (!doc.exists || doc.data().user_id !== uid)
        throw new HttpsError('permission-denied', 'not yours');
    await doc.ref.update({ status: 'reverted', reverted_at: new Date().toISOString() });
    return { ok: true };
});
// Vybe agent / commander — Gemini tool-calling for app control + chat
export const vybeAgent = onCall({ secrets: SECRETS }, async (request) => {
    const uid = requireAuth(request);
    const { messages, aiName, aiPersonality, location, context, } = (request.data || {});
    if (!messages?.length)
        throw new HttpsError('invalid-argument', 'messages required');
    const [dnaSnap, profileSnap, prefsSnap] = await Promise.all([
        db.collection('vybe_dna').doc(uid).get(),
        db.collection('profiles').where('user_id', '==', uid).limit(1).get(),
        db.collection('dna_content_preferences').doc(uid).get(),
    ]);
    const dna = dnaSnap.data() || {};
    const profile = profileSnap.docs[0]?.data() || {};
    const prefs = prefsSnap.data() || {};
    const pv = (dna.personality_vector || {});
    const interests = (profile.interests || profile.onboarding_interests || []);
    const name = (aiName || 'VYBE-AI').slice(0, 50);
    const personality = (aiPersonality || 'Friendly, helpful, concise.').slice(0, 500);
    const locCtx = location
        ? `Location: ${location.city || 'nearby'} (${Number(location.lat).toFixed(2)}, ${Number(location.lng).toFixed(2)}).`
        : 'Location not enabled.';
    const widgetCatalog = context?.widgetCatalog?.join(', ') ||
        'greeting, stories, xp_streak, ai_brief, vybe_dna, wallet, shop, communities, feed';
    const systemPrompt = `You are ${name}, the unified VYBE AI agent — chat companion AND app controller.
PERSONALITY: ${personality}
USER: ${profile.display_name || 'friend'}
DNA: Activity ${Math.round((pv.activity || 0) * 100)}% | Social ${Math.round((pv.social || 0) * 100)}% | Creative ${Math.round((pv.creative || 0) * 100)}%
Interests: ${interests.slice(0, 10).join(', ') || 'not set'}
Boosted: ${(prefs.boost_topics || []).join(', ') || 'none'}
${locCtx}
APP: route ${context?.route || '/home'} | theme ${context?.currentPreset || 'classic'}
Widgets visible: ${context?.layout?.order?.filter((id) => !(context?.layout?.hidden || []).includes(id))?.join(', ') || 'default'}
Widget catalog: ${widgetCatalog}
Allowed paths: ${AGENT_NAV_PATHS.join(', ')}
Theme presets: ${THEME_PRESET_KEYS.join(', ')}
Always call ${AGENT_TOOL_NAME} with message + actions. Pure questions → actions: []. Be concise.`;
    const sanitized = messages.slice(-20).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '').slice(0, 4000),
    }));
    const { toolCalls } = await chatCompletion({
        model: modelForTier('creative'),
        max_tokens: TOKEN_BUDGET.creative,
        messages: [{ role: 'system', content: systemPrompt }, ...sanitized],
        tools: [buildVybeAgentActTool()],
        tool_choice: { type: 'function', function: { name: AGENT_TOOL_NAME } },
    });
    const toolCall = toolCalls?.[0];
    if (toolCall?.function?.arguments) {
        const result = parseAgentPlan(JSON.parse(toolCall.function.arguments));
        await db.collection('analytics_events').add({
            user_id: uid, event: 'vybe_agent_query', created_at: new Date().toISOString(),
        });
        return result;
    }
    return { message: 'How can I help?', actions: [] };
});
export const vybeCommander = onCall({ secrets: SECRETS }, async (request) => {
    await requireAdmin(request);
    const { command } = (request.data || {});
    const { content } = await chatCompletion({
        messages: [
            { role: 'system', content: 'You are VYBE Commander — an admin operations assistant. Parse the command and return a structured action plan as JSON.' },
            { role: 'user', content: command || '' },
        ],
        response_format: { type: 'json_object' },
        model: modelForTier('standard'),
        max_tokens: TOKEN_BUDGET.creative,
    });
    return { ok: true, plan: content };
});
//# sourceMappingURL=aiExtras.js.map
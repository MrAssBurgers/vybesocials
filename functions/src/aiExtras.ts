/**
 * Lighter-weight AI utilities — thin wrappers over Lovable AI Gateway.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAuth, requireAdmin, db } from './_shared/admin.js';
import { chatCompletion } from './_shared/lovableAi.js';

const SECRETS = ['LOVABLE_API_KEY'];

function simpleAI(systemPrompt: string) {
  return onCall({ secrets: SECRETS }, async (request) => {
    requireAuth(request);
    const { input, context } = (request.data || {}) as any;
    if (!input) throw new HttpsError('invalid-argument', 'input required');
    const { content } = await chatCompletion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: typeof input === 'string' ? input : JSON.stringify(input) + (context ? `\nContext: ${JSON.stringify(context).slice(0, 600)}` : '') },
      ],
      temperature: 0.5,
    });
    return { ok: true, content };
  });
}

export const aiAdaptiveResponse = simpleAI('Adapt the user message to match the recipient\'s vibe. Return a short reply.');
export const aiAutoFix = simpleAI('Fix grammar, spelling, and clarity in the user\'s text. Return only the corrected text.');
export const aiDetectText = simpleAI('Detect what language and intent the input represents. Return JSON: {"language":"en","intent":"...","confidence":0.9}.');
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
  const { prompt } = (request.data || {}) as any;
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: 'You are an admin assistant for VYBE. Help with operational tasks: SQL hints, user queries, data fixes. Be precise.' },
      { role: 'user', content: prompt || '' },
    ],
  });
  return { ok: true, content };
});

export const adminDebugTools = onCall(async (request) => {
  await requireAdmin(request);
  const { action } = (request.data || {}) as any;
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

export const analyzeBugReport = onCall({ secrets: SECRETS }, async (request) => {
  await requireAdmin(request);
  const { report_id } = (request.data || {}) as any;
  const doc = await db.collection('bug_reports').doc(report_id).get();
  if (!doc.exists) throw new HttpsError('not-found', 'Bug report not found');
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: 'Analyze a bug report. Identify likely root cause, severity, and suggested fix. Be concise (3 bullets).' },
      { role: 'user', content: JSON.stringify(doc.data()).slice(0, 4000) },
    ],
  });
  await doc.ref.update({ ai_analysis: content, analyzed_at: new Date().toISOString() });
  return { ok: true, content };
});

export const analyzeError = onCall({ secrets: SECRETS }, async (request) => {
  await requireAdmin(request);
  const { error_message, stack } = (request.data || {}) as any;
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: 'Diagnose a JS/TS error. Provide likely cause + 1 fix in 3 sentences.' },
      { role: 'user', content: `Error: ${error_message}\n\nStack: ${(stack || '').slice(0, 2000)}` },
    ],
  });
  return { ok: true, content };
});

// DNA Autopilot
export const dnaAutopilot = onCall({ secrets: SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const settingsSnap = await db.collection('dna_agent_settings').doc(uid).get();
  const mode = (settingsSnap.data() as any)?.mode || 'suggest';
  if (mode === 'off') return { ok: true, mode: 'off', actions: [] };
  const dnaSnap = await db.collection('vybe_dna').doc(uid).get();
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: 'You are the DNA Autopilot. Suggest 3 actions to optimize the user\'s feed/theme/layout based on their DNA. Output JSON: [{"type":"apply_theme|navigate|generate_theme","reason":"..."}].' },
      { role: 'user', content: JSON.stringify(dnaSnap.data() || {}).slice(0, 1500) },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.6,
  });
  let actions: any[] = [];
  try { actions = JSON.parse(content); } catch { actions = []; }
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
  const { action_id } = (request.data || {}) as any;
  const doc = await db.collection('dna_agent_actions').doc(action_id).get();
  if (!doc.exists || (doc.data() as any).user_id !== uid) throw new HttpsError('permission-denied', 'not yours');
  await doc.ref.update({ status: 'reverted', reverted_at: new Date().toISOString() });
  return { ok: true };
});

// Vybe agent / commander
export const vybeAgent = onCall({ secrets: SECRETS }, async (request) => {
  const uid = requireAuth(request);
  const { message, history } = (request.data || {}) as any;
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: 'You are the VYBE Agent — a multimodal assistant. Be concise, helpful, and on-brand (Gen-Z, playful).' },
      ...(Array.isArray(history) ? history.slice(-10) : []),
      { role: 'user', content: message || '' },
    ],
    temperature: 0.7,
  });
  await db.collection('analytics_events').add({
    user_id: uid, event: 'vybe_agent_query', created_at: new Date().toISOString(),
  });
  return { ok: true, content };
});

export const vybeCommander = onCall({ secrets: SECRETS }, async (request) => {
  await requireAdmin(request);
  const { command } = (request.data || {}) as any;
  const { content } = await chatCompletion({
    messages: [
      { role: 'system', content: 'You are VYBE Commander — an admin operations assistant. Parse the command and return a structured action plan as JSON.' },
      { role: 'user', content: command || '' },
    ],
    response_format: { type: 'json_object' },
  });
  return { ok: true, plan: content };
});

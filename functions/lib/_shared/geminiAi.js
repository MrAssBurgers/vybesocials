import { HttpsError } from 'firebase-functions/v2/https';
import { AI_MODEL_LITE, modelFallbackChain } from './aiModels.js';
const GEMINI_OPENAI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const GEMINI_IMAGE_MODEL = 'gemini-2.0-flash-preview-image-generation';
function requireGeminiKey() {
    const key = process.env.GEMINI_API_KEY?.trim();
    if (!key) {
        throw new HttpsError('failed-precondition', 'AI not configured — set GEMINI_API_KEY on Cloud Functions');
    }
    if (!key.startsWith('AIza') && !key.startsWith('AQ.')) {
        throw new HttpsError('failed-precondition', 'GEMINI_API_KEY is invalid — use a Google AI Studio key (AIza…) or access token (AQ.…). Run npm run setup:gemini-secrets.');
    }
    return key;
}
function isUnavailableStatus(status) {
    return status === 503 || status === 529 || status >= 500;
}
function maxAttemptsForModel(model) {
    return model.includes('lite') ? 1 : 2;
}
/** Direct Gemini chat completions (OpenAI-compatible endpoint). */
export async function chatCompletion(opts) {
    const apiKey = opts.apiKey?.trim() || requireGeminiKey();
    const models = modelFallbackChain(opts.model);
    let lastErr;
    for (const model of models) {
        for (let attempt = 0; attempt < maxAttemptsForModel(model); attempt++) {
            if (attempt > 0)
                await new Promise((r) => setTimeout(r, 500 * attempt));
            const res = await fetch(GEMINI_OPENAI_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model,
                    temperature: opts.temperature ?? 0.7,
                    max_tokens: opts.max_tokens ?? 768,
                    // Gemini 2.5 thinking models silently spend the whole max_tokens
                    // budget on reasoning, returning empty/truncated content for short
                    // structured tasks. None of our calls benefit from thinking.
                    reasoning_effort: 'none',
                    messages: opts.messages,
                    response_format: opts.response_format,
                    tools: opts.tools,
                    tool_choice: opts.tool_choice,
                }),
            });
            if (res.ok) {
                const raw = await res.json();
                const message = raw?.choices?.[0]?.message;
                const content = message?.content ?? '';
                const toolCalls = message?.tool_calls;
                if (!content.trim() && !toolCalls?.length && model !== models[models.length - 1]) {
                    lastErr = 'empty response';
                    break;
                }
                return { content, raw, toolCalls };
            }
            if (res.status === 429) {
                const body = await res.text();
                if (/credit|billing|prepay|depleted|quota/i.test(body)) {
                    throw new HttpsError('resource-exhausted', 'Google AI credits are depleted. Add billing at https://ai.studio/projects or add your own key in Settings → VYBE AI.');
                }
                throw new HttpsError('resource-exhausted', 'AI rate limit — try again shortly');
            }
            if (res.status === 402)
                throw new HttpsError('failed-precondition', 'AI credits exhausted');
            if (res.status < 500) {
                lastErr = `AI ${res.status}: ${await res.text()}`;
                if (opts.usingByok && (res.status === 401 || res.status === 403)) {
                    throw new HttpsError('failed-precondition', 'Your Google AI key was rejected. Remove API restrictions in AI Studio or create a new key in Settings → VYBE AI.');
                }
                throw new HttpsError('failed-precondition', lastErr);
            }
            lastErr = `AI ${res.status}: ${await res.text().then((t) => t.slice(0, 120))}`;
            if (isUnavailableStatus(res.status))
                break;
        }
    }
    throw new HttpsError('unavailable', lastErr || 'AI unavailable');
}
function parseJsonFromModelText(raw) {
    const trimmed = String(raw || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    try {
        return JSON.parse(trimmed);
    }
    catch {
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
}
function normalizeHex(hex) {
    const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
    return m ? `#${m[1].toUpperCase()}` : null;
}
function extractHexColors(text) {
    const found = text.match(/#[0-9a-fA-F]{6}\b/g) || [];
    return [...new Set(found.map((h) => h.toUpperCase()))];
}
function coerceResearchedPalette(data, fallbackText) {
    const obj = data && typeof data === 'object' ? data : null;
    const rawColors = Array.isArray(obj?.colors) ? obj.colors : [];
    const colors = [];
    for (const entry of rawColors) {
        if (!entry || typeof entry !== 'object')
            continue;
        const row = entry;
        const hex = normalizeHex(String(row.hex || ''));
        if (!hex)
            continue;
        const role = String(row.role || '').toLowerCase();
        const validRole = role === 'primary' ||
            role === 'secondary' ||
            role === 'accent' ||
            role === 'background' ||
            role === 'neutral'
            ? role
            : undefined;
        colors.push({
            name: String(row.name || hex).slice(0, 40),
            hex,
            role: validRole,
        });
    }
    if (colors.length < 2 && fallbackText) {
        for (const hex of extractHexColors(fallbackText)) {
            if (!colors.some((c) => c.hex === hex)) {
                colors.push({ name: hex, hex });
            }
        }
    }
    if (colors.length < 2)
        return null;
    const mode = obj?.mode === 'light' ? 'light' : 'dark';
    return { mode, colors: colors.slice(0, 8) };
}
/**
 * Google-Search-grounded lookup returning a structured palette.
 * Every distinct real color is listed with hex codes so callers can map
 * them deterministically into theme slots (no AI reinterpretation).
 */
export async function groundedColorResearchStructured(subject, opts) {
    const apiKey = opts?.apiKey?.trim() || requireGeminiKey();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts?.timeoutMs ?? 12000);
    try {
        const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
            method: 'POST',
            headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
            signal: ctrl.signal,
            body: JSON.stringify({
                contents: [
                    {
                        parts: [
                            {
                                text: `Research the EXACT real-world colors of "${subject.slice(0, 300)}". ` +
                                    'Return ONLY valid JSON (no markdown): ' +
                                    '{"mode":"dark"|"light","colors":[{"name":"Blue","hex":"#00AFF0","role":"primary"},...]} ' +
                                    'Rules: include EVERY distinct official or dominant color (2-6 colors, do not skip any); ' +
                                    'use precise hex codes from brand guidelines or accurate visual references; ' +
                                    'role is one of primary, secondary, accent, background, neutral; ' +
                                    'assign black or dark gray as background (not neutral) for dark-looking brands; ' +
                                    'mode reflects whether the subject typically appears on dark or light backgrounds.',
                            },
                        ],
                    },
                ],
                tools: [{ google_search: {} }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 768,
                    thinkingConfig: { thinkingBudget: 0 },
                },
            }),
        });
        if (!res.ok) {
            console.warn('[groundedColorResearchStructured] HTTP', res.status, (await res.text()).slice(0, 160));
            return null;
        }
        const data = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const text = parts.map((p) => p?.text || '').join(' ').trim();
        const parsed = parseJsonFromModelText(text);
        return coerceResearchedPalette(parsed, text);
    }
    catch (err) {
        console.warn('[groundedColorResearchStructured] failed:', err instanceof Error ? err.message : err);
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
/** @deprecated Use groundedColorResearchStructured — kept for compatibility. */
export async function groundedColorResearch(subject, opts) {
    const palette = await groundedColorResearchStructured(subject, opts);
    if (!palette)
        return null;
    return palette.colors.map((c) => `${c.name}: ${c.hex}${c.role ? ` (${c.role})` : ''}`).join(' · ');
}
/** Ping Gemini with a BYOK key before persisting it. */
export async function validateGoogleAiKey(key) {
    const trimmed = key.trim();
    if (!trimmed) {
        throw new HttpsError('invalid-argument', 'apiKey required');
    }
    const res = await fetch(GEMINI_OPENAI_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${trimmed}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: AI_MODEL_LITE,
            max_tokens: 8,
            messages: [{ role: 'user', content: 'ping' }],
        }),
    });
    if (res.ok)
        return;
    const body = await res.text();
    if (res.status === 401 || res.status === 403) {
        throw new HttpsError('failed-precondition', 'Your Google AI key was rejected. Remove API restrictions in AI Studio or create a new key.');
    }
    throw new HttpsError('failed-precondition', `Key validation failed (${res.status}): ${body.slice(0, 240)}`);
}
/** Generate an image via Gemini image model; returns base64 data URL or null. */
export async function generateImage(prompt) {
    const apiKey = requireGeminiKey();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
    });
    if (!res.ok) {
        throw new HttpsError('internal', `Image gen ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
        const inline = part?.inlineData || part?.inline_data;
        if (inline?.data) {
            const mime = inline.mimeType || inline.mime_type || 'image/png';
            return `data:${mime};base64,${inline.data}`;
        }
    }
    return null;
}
//# sourceMappingURL=geminiAi.js.map
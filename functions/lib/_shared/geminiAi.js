import { HttpsError } from 'firebase-functions/v2/https';
const GEMINI_OPENAI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const GEMINI_IMAGE_MODEL = 'gemini-2.0-flash-preview-image-generation';
function requireGeminiKey() {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        throw new HttpsError('failed-precondition', 'AI not configured — set GEMINI_API_KEY on Cloud Functions');
    }
    return key;
}
/** Direct Gemini chat completions (OpenAI-compatible endpoint). */
export async function chatCompletion(opts) {
    const apiKey = opts.apiKey?.trim() || requireGeminiKey();
    const models = [
        ...new Set([opts.model || 'gemini-2.5-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'].filter(Boolean)),
    ];
    let lastErr;
    for (const model of models) {
        for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt > 0)
                await new Promise((r) => setTimeout(r, 800 * attempt));
            const res = await fetch(GEMINI_OPENAI_URL, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model,
                    temperature: opts.temperature ?? 0.7,
                    max_tokens: opts.max_tokens ?? 1024,
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
                return { content, raw, toolCalls };
            }
            if (res.status === 429)
                throw new HttpsError('resource-exhausted', 'AI rate limit — try again shortly');
            if (res.status === 402)
                throw new HttpsError('failed-precondition', 'AI credits exhausted');
            if (res.status < 500) {
                lastErr = `AI ${res.status}: ${await res.text()}`;
                throw new HttpsError('failed-precondition', lastErr);
            }
            lastErr = `AI ${res.status}`;
        }
    }
    throw new HttpsError('unavailable', lastErr || 'AI unavailable');
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
/**
 * OpenAI Moderation API — Phase 1 text safety for Vybe Check.
 * https://platform.openai.com/docs/guides/moderation
 */
function maxCategoryScore(scores) {
    return Math.max(0, ...Object.values(scores));
}
let openAiKeyUsable = null;
export function isOpenAiKeyCachedInvalid() {
    return openAiKeyUsable === false;
}
export function markOpenAiKeyInvalid() {
    openAiKeyUsable = false;
}
export async function moderateTextWithOpenAI(apiKey, input) {
    const trimmed = input.trim();
    if (!trimmed) {
        return { flagged: false, score: 0, categories: [], category_scores: {} };
    }
    if (openAiKeyUsable === false) {
        return { flagged: false, score: 0, categories: [], category_scores: {} };
    }
    const res = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'omni-moderation-latest', input: trimmed.slice(0, 32_000) }),
    });
    if (!res.ok) {
        const body = await res.text();
        if (res.status === 401 || res.status === 403) {
            openAiKeyUsable = false;
            console.warn('[openaiModeration] OPENAI_API_KEY invalid — using Gemini-only Vybe Check');
            return { flagged: false, score: 0, categories: [], category_scores: {} };
        }
        console.error('[openaiModeration]', res.status, body.slice(0, 300));
        throw new Error(`OpenAI moderation failed: ${res.status}`);
    }
    openAiKeyUsable = true;
    const data = (await res.json());
    const result = data.results?.[0];
    if (!result) {
        return { flagged: false, score: 0, categories: [], category_scores: {} };
    }
    const category_scores = result.category_scores || {};
    const categories = Object.entries(result.categories || {})
        .filter(([, v]) => v)
        .map(([k]) => k);
    const score = maxCategoryScore(category_scores);
    return {
        flagged: !!result.flagged || score >= 0.5,
        score,
        categories,
        category_scores,
    };
}
/** Combine caption, hashtags, transcript, OCR, comments into one moderation pass. */
export async function moderateVybeCheckText(apiKey, text) {
    const parts = [
        text.caption,
        text.hashtags?.length ? `Hashtags: ${text.hashtags.join(' ')}` : '',
        text.transcript ? `Audio transcript: ${text.transcript}` : '',
        text.ocr_text ? `OCR text: ${text.ocr_text}` : '',
        text.comments?.length ? `Comments: ${text.comments.join('\n')}` : '',
    ].filter(Boolean);
    if (!parts.length) {
        return { flagged: false, score: 0, categories: [], category_scores: {} };
    }
    return moderateTextWithOpenAI(apiKey, parts.join('\n\n'));
}
//# sourceMappingURL=openaiModeration.js.map
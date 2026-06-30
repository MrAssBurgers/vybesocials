/**
 * Cost-aware AI routing — right tool for each job, cheapest model that still works.
 *
 * Gemini (GEMINI_API_KEY):
 *   - lite  → smart replies, DM assist, captions, briefs, summaries (auto-escalates to flash on 5xx)
 *   - flash → VYBE AI chat, typed theme prompts, agent tools, safety review
 *
 * OpenAI (OPENAI_API_KEY) — optional, very cheap per call:
 *   - omni-moderation → Vybe Check text only (skipped gracefully if key invalid)
 *   - whisper-1       → Vybe Check video transcription only
 *
 * Google Cloud Vision → NSFW frame scan (not LLM billing)
 */
export const AI_ROUTING = {
    gemini: {
        micro: ['aiSmartReplies', 'aiMessageAssist', 'aiHumanize', 'generateCaption', 'aiCatchUp', 'briefs'],
        standard: ['aiChat', 'dnaChat', 'detectAiContent'],
        creative: ['generateTheme'],
        image: ['generateBackground'],
        safety: ['aiSafetyScan', 'scanContentSafety'],
    },
    openai: {
        moderation: ['startVybeCheck', 'vybeCheckPipeline'],
        speechToText: ['startVybeCheck'],
    },
    vision: {
        safeSearch: ['startVybeCheck'],
    },
};
//# sourceMappingURL=aiRouting.js.map
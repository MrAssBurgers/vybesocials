/**
 * Cost-aware Gemini routing — lite first (cheapest), flash on escalation (quality).
 * OpenAI is only used for Vybe Check moderation/STT (see openaiModeration.ts).
 */

export const AI_MODEL_LITE = 'gemini-2.5-flash-lite';
export const AI_MODEL_FLASH = 'gemini-2.5-flash';

/** @deprecated Use AI_MODEL_LITE — kept for existing imports */
export const CHEAP_CHAT_MODEL = AI_MODEL_LITE;
export const QUALITY_CHAT_MODEL = AI_MODEL_FLASH;

export type AiModelTier = 'micro' | 'standard' | 'creative';

/** Primary model for a task tier (chatCompletion escalates on 5xx / empty). */
export function modelForTier(tier: AiModelTier): string {
  if (tier === 'creative') return AI_MODEL_FLASH;
  return AI_MODEL_LITE;
}

/** Output token caps — keep responses short to save cost without hurting UX. */
export const TOKEN_BUDGET = {
  micro: 128,
  short: 220,
  standard: 400,
  chat: 640,
  creative: 1024,
  summary: 280,
} as const;

/** Model fallback chain: requested → lite → flash (deduped). */
export function modelFallbackChain(primary?: string): string[] {
  const p = primary?.trim() || AI_MODEL_LITE;
  return [...new Set([p, AI_MODEL_LITE, AI_MODEL_FLASH])];
}

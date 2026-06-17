/**
 * Phase 1 VYBE AI routing — which provider handles which feature.
 * Secrets: GEMINI_API_KEY, OPENAI_API_KEY (Firebase Secret Manager).
 * ElevenLabs: future voice — not wired in Phase 1.
 */

export const AI_ROUTING = {
  /** GPT-5.x via OpenAI — captions, assistant, summaries, profiles, spam, appeals */
  openai: {
    captions: true,
    aiAssistant: true,
    searchSummaries: true,
    userInterestProfiles: true,
    spamChecks: true,
    appeals: true,
    moderation: true,
    speechToText: true,
  },
  /** Gemini — camera AI, image understanding, OCR, visual search, borderline review */
  gemini: {
    cameraAi: true,
    imageUnderstanding: true,
    ocr: true,
    visualSearch: true,
    borderlineImageVideoReview: true,
  },
  /** Google Cloud Vision Safe Search — NSFW frame detection */
  safeSearch: {
    imageNsfw: true,
    videoFrameScan: true,
  },
  /** Explicitly excluded Phase 1 */
  excluded: ['hive', 'aws_rekognition', 'sightengine'] as const,
} as const;

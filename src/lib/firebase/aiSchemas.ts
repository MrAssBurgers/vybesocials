import { Schema } from 'firebase/ai';

/** Caption suggestions for post composer. */
export const captionsResponseSchema = Schema.object({
  properties: {
    captions: Schema.array({ items: Schema.string() }),
  },
});

/** Short comment reply suggestions. */
export const commentSuggestionsSchema = Schema.object({
  properties: {
    suggestions: Schema.array({ items: Schema.string() }),
  },
});

/** Daily brief summary block (client enriches with Firestore data). */
export const briefSummarySchema = Schema.object({
  properties: {
    summary: Schema.string(),
    highlights: Schema.array({ items: Schema.string() }),
  },
});

/** DNA insight snippet. */
export const dnaInsightSchema = Schema.object({
  properties: {
    insight: Schema.string(),
    traits: Schema.array({
      items: Schema.object({
        properties: {
          name: Schema.string(),
          score: Schema.number(),
          blurb: Schema.string(),
        },
      }),
    }),
  },
});

/** VYBE agent plan — matches vybe_agent_act tool output shape (Phase 3+). */
export const agentPlanSchema = Schema.object({
  properties: {
    message: Schema.string(),
    actions: Schema.array({
      items: Schema.object({
        properties: {
          type: Schema.string(),
          path: Schema.string(),
          preset: Schema.string(),
          prompt: Schema.string(),
          widget_id: Schema.string(),
          visible: Schema.boolean(),
          order: Schema.array({ items: Schema.string() }),
        },
        optionalProperties: ['path', 'preset', 'prompt', 'widget_id', 'visible', 'order'],
      }),
    }),
  },
});

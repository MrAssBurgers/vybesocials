

## Make AI Nudity Detection Bulletproof

### Root Cause

The detection pipeline has two critical weaknesses:

1. **Client-side scanner is a no-op**: `nsfwScanner.ts` `scanImage()` always returns `allowed` -- it does nothing. The entire burden falls on the server-side Gemini call.

2. **Gemini's own safety filters block analysis**: When Gemini receives explicit content, its built-in safety filters can refuse to analyze the image entirely, returning empty/safe results instead of flagging it. The API call doesn't include `safetySettings` to disable Gemini's content blocking for analysis purposes.

3. **Prompt gaps**: The current prompt doesn't specifically address tricky angles, partial visibility, close-ups, or creative framing designed to evade detection.

### Changes

**File: `supabase/functions/ai-safety-scan/index.ts`**

1. Add `safetySettings` to the Gemini API call to set all harm categories to `BLOCK_NONE` -- this lets Gemini actually analyze explicit images instead of refusing to look at them:
```typescript
safetySettings: [
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
]
```

2. Strengthen the nudity detection prompt with specific edge cases:
   - Unusual angles, close-ups, side views, underboob, sideboob
   - Hands/arms/objects partially covering nudity
   - Mirror reflections, blurred backgrounds with nude subjects
   - "Accidental" nudity, wardrobe malfunctions
   - Creative cropping designed to show maximum skin while technically "not nude"

3. Add a fallback: if Gemini returns empty text (blocked by its own filters), treat it as `score: 0.8` flagged for nudity -- because Gemini refusing to analyze is itself a strong signal the content is explicit.

**File: `supabase/functions/rate-sticker-content/index.ts`**
- Apply the same `safetySettings` and improved prompt to the sticker rating function.

**Deploy**: Both edge functions after changes.

### Technical Detail

The key fix is `safetySettings: BLOCK_NONE`. Without this, Gemini sees an explicit image, triggers its own safety refusal, returns no useful output, and the code falls back to `{ is_ai: false, confidence: 0 }` -- content passes undetected. With `BLOCK_NONE`, Gemini will analyze the image and return a proper classification.


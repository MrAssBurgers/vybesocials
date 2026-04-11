

## Fix: Daily Brief Sources Missing — Switch to Lovable AI Gateway

### Root Cause

The edge function `ai-catch-up` calls the Gemini API directly using a `GEMINI_API_KEY` that's on the free tier (20 requests/day). The logs show 429 quota errors. When this fails, `fetchGeminiNews()` returns `[]`, so `liveUpdates` is empty — no sources, no news cards.

### Fix

Switch `fetchGeminiNews` from direct Gemini API to the **Lovable AI Gateway** (`google/gemini-2.5-flash`), which has no per-key quota limits. This also means we no longer need the `GEMINI_API_KEY` secret.

However, there's a complication: the current code uses Gemini's `google_search` grounding tool to get real-time news + source URLs. The Lovable AI Gateway may not support the `google_search` tool parameter. If it doesn't, we need to adapt:

**Option A (preferred):** Use the Lovable AI Gateway with `google/gemini-2.5-flash`. The model can still generate topic summaries based on its training data, but sources would come from the model's knowledge rather than live grounding. The prompt already asks for source URLs in the JSON output — Gemini will still try to provide them.

**Option B (fallback):** If grounding is critical, keep the direct Gemini call but add proper retry logic with exponential backoff and a fallback to the Lovable AI Gateway when the direct call fails.

### Changes

| File | Change |
|------|--------|
| `supabase/functions/ai-catch-up/index.ts` | Replace direct Gemini API call with Lovable AI Gateway (`https://agtcyxjxgkdyoxwxkjth.supabase.co/functions/v1/ai-proxy`). Update request format to match gateway schema. Keep grounding source extraction as fallback. Add explicit instruction in prompt for Gemini to include real source URLs. |

### Technical Detail

```typescript
// Before (direct Gemini, hits free-tier quota)
fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
  body: JSON.stringify({ contents: [...], tools: [{ google_search: {} }] })
})

// After (Lovable AI Gateway, no quota issues)  
fetch(`https://agtcyxjxgkdyoxwxkjth.supabase.co/functions/v1/ai-proxy`, {
  headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  body: JSON.stringify({
    model: 'google/gemini-2.5-flash',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
    max_tokens: 8192
  })
})
```

The prompt will be enhanced to strongly instruct the model to include real, current source URLs for each topic in the JSON output.


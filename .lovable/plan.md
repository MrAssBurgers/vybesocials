

## Plan: Fix Daily Brief Live News — JSON Parsing & Token Limit

### Root Cause

The edge function logs show the exact error:

```
Failed to parse Gemini JSON: SyntaxError: Bad control character in string literal in JSON at position 763
```

Gemini's response contains unescaped control characters (newlines, tabs) inside JSON string values, which breaks `JSON.parse`. Additionally, `maxOutputTokens: 2048` is borderline — responses are getting truncated mid-JSON, producing incomplete output that also fails to parse.

When parsing fails, `fetchGeminiNews` returns `[]`, so `liveUpdates` is empty and the brief shows no news.

### Fix (single file)

**File: `supabase/functions/ai-catch-up/index.ts`**

1. **Increase `maxOutputTokens` from 2048 to 8192** — prevents truncated JSON for 7+ topics

2. **Sanitize JSON before parsing** — strip control characters that Gemini injects into string values:
   ```typescript
   // Before JSON.parse, sanitize control chars inside strings
   jsonStr = jsonStr.replace(/[\x00-\x1F\x7F]/g, (ch) => {
     if (ch === '\n' || ch === '\r' || ch === '\t') return ' ';
     return '';
   });
   ```

3. **Add a fallback regex extractor** — if `JSON.parse` still fails after sanitization, attempt to extract items via regex pattern matching so partial results aren't lost entirely

4. **Check `finishReason`** — log if the response was truncated so we can diagnose future issues:
   ```typescript
   const finishReason = data.candidates?.[0]?.finishReason;
   if (finishReason === 'MAX_TOKENS') {
     console.warn("[Brief] Response truncated by token limit");
   }
   ```

### No database changes needed.


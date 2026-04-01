

## Plan: Revamp Daily Brief — Replace Dead Perplexity with Gemini + Google Search Grounding

### Root Cause

The Daily Brief is completely broken because the **Perplexity API quota is exhausted** (401 insufficient_quota). Every single news fetch fails, so the brief returns with zero live updates — making it useless. The session replay confirms: it loads, hits the error state immediately, and shows "Could not load brief."

### Solution

Replace Perplexity entirely with **Gemini API + Google Search grounding**, which is already available via the `GEMINI_API_KEY` secret and costs nothing extra. Gemini's grounding feature lets it search Google in real-time and return sourced, current news — exactly what Perplexity was doing but without the quota issues.

### Technical Details

#### 1. Rewrite the Edge Function (`supabase/functions/ai-catch-up/index.ts`)

**Remove**: All Perplexity-specific code (`fetchPerplexityData`, `PERPLEXITY_API_KEY`, `interestSearchQueries` map, `PerplexityResult` interface)

**Add**: Gemini API with Google Search grounding
- Use `gemini-2.5-flash` model via `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`
- Enable grounding with `tools: [{ google_search: {} }]` in the request body
- Send a single batched prompt asking Gemini to return news for ALL user interests at once (1 API call instead of 7+ Perplexity calls — faster and cheaper)
- Parse the response into the same `LiveUpdate[]` format the frontend expects (interest, content, sources, imageUrl, category)
- Extract grounding sources from `groundingMetadata.groundingChunks` in the response
- Keep GPS-based local news by including location context in the prompt

**Fallback chain**: If Gemini grounding fails, use Lovable AI gateway as backup. If both fail, still return the app stats (messages, notifications, challenges) so the brief is never completely empty.

**Response format**: Ask Gemini to return structured JSON with an array of news items, each with `topic`, `summary`, `sources[]`, and `category`. Parse this to match the existing `BriefUpdate` interface.

#### 2. Consolidate AI calls
Currently the function makes 7+ Perplexity calls THEN another Lovable AI call for the summary. Instead:
- **One Gemini call** with grounding for news + summary combined
- Include the user's app stats (notifications, messages, streak) in the prompt context
- Ask it to return both the personalized summary AND the news items in one structured JSON response
- This cuts latency from ~8-10 seconds to ~3-4 seconds

#### 3. Improve error resilience in the frontend (`src/components/home/AIBriefSheet.tsx`)
- If the edge function returns app stats but no news (partial success), show the stats sections (messages, challenges, notifications) instead of showing nothing
- Increase cache TTL from 5 minutes to 30 minutes so stale data is shown while refreshing
- Add a retry with exponential backoff (currently just fails immediately)
- Show a more helpful error message distinguishing "no news available" from "brief failed entirely"

#### 4. Speed up the loading experience
- Remove the artificial progress simulation — it currently fakes progress at fixed intervals which makes it feel slower than it is
- Use a simple indeterminate spinner/animation instead of the fake percentage bar
- Show cached brief immediately while fetching fresh data in background (currently only does this sometimes)

### Files Changed

1. **`supabase/functions/ai-catch-up/index.ts`** — Major rewrite: remove Perplexity, add Gemini with Google Search grounding, single consolidated AI call, structured JSON output
2. **`src/components/home/AIBriefSheet.tsx`** — Increase cache TTL, improve partial-data handling, better error states
3. **`src/components/home/AIBriefLoadingState.tsx`** — Replace fake progress bar with clean indeterminate loading animation

### What This Achieves
- Brief actually works (no more quota errors)
- Faster load times (1 API call instead of 8+)
- Real-time sourced news with Google Search grounding
- Graceful degradation (app stats always shown even if news fails)
- No ongoing cost concerns (Gemini API key is already paid for)




## Plan

### 1. Match VYBE-AI header pfp to the DMs page version
**File:** `src/pages/AIChat.tsx` (lines 362-367)

Replace the small simple gradient circle with the same animated pfp used in `ConversationList.tsx` (`AutisyAIChatRow`, lines 74-84): pulsing blur halo, gradient ring border, inner gradient overlay, sparkles on the V, drop-shadow glow, and a green online dot with shadow. Sized down slightly (`h-10 w-10` instead of `h-12 w-12`) to fit the header neatly.

Also update the small inline assistant message bubble avatar (lines 408-410 and 451-453) to a mini version of the same look (gradient ring + sparkles) so the whole page feels cohesive.

### 2. Add AI Humanizer for essays
Linked GPT (`g-2azCVmXdy-ai-humanizer`) rewrites AI-generated text into natural, human-sounding prose — varied sentence rhythm, contractions, mild imperfections, removed AI tells (em-dashes overuse, "delve", "in conclusion", uniform cadence).

**New edge function:** `supabase/functions/ai-humanize/index.ts`
- Accepts `{ text: string, tone?: 'casual' | 'academic' | 'natural' }` (default `natural`)
- Rate-limited per user (10/min), auth-required
- Calls Lovable AI Gateway with `google/gemini-3-flash-preview` and a strong humanizer system prompt (sentence-length variation, contractions, idioms, remove AI cliches, preserve meaning + length)
- Streams back the humanized text via SSE (token-by-token) following the streaming pattern already used in `ai-chat`
- Registered in `supabase/config.toml` with `verify_jwt = true`

**UI in `src/pages/AIChat.tsx`:**
- New "✍️ Humanize my essay" entry added to `QUICK_PROMPTS` 
- New `HumanizerSheet` modal (bottom sheet, opened via the dropdown menu "More" → "AI Humanizer ✍️"):
  - Large textarea for pasting essay (up to 8000 chars)
  - Tone selector chips: **Natural · Casual · Academic**
  - "Humanize" button → streams output into a results panel below
  - Copy-to-clipboard + "Replace original" buttons on the result
  - Word count + "removes AI tells" hint

### Files to change
1. `src/pages/AIChat.tsx` — upgrade header + bubble avatars, add Humanizer dropdown item + bottom-sheet UI + streaming logic
2. `supabase/functions/ai-humanize/index.ts` (new) — humanizer SSE endpoint
3. `supabase/functions/ai-humanize/deno.json` (new)
4. `supabase/config.toml` — register the new function

### Out of scope
- Changing the DMs page row (already correct — it's the source of truth)
- Renaming "VYBE-AI" or other AI settings


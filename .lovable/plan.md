

## Plan: Scroll Fixes, Daily Brief Speed, Content Filter Toggle, Stickers System

This is a large set of changes across 6 areas. Here's the breakdown:

---

### 1. VybeDNA Scroll Fix

**Problem**: The page renders inside `AppLayout` which has `overflow-y-auto` on `<main>`, but VybeDNA's outer `<div className="pb-24">` has no explicit height forcing — it relies on the parent to scroll. The sticky header + content layout works, but `AppLayout`'s `contain: 'layout style'` on desktop may be clipping overflow.

**Fix** in `src/pages/VybeDNA.tsx`:
- Wrap the content div with explicit `min-h-[calc(100vh+1px)]` to force the scroll container to recognize there's content below the fold
- Remove any `overflow-hidden` ancestors that clip it

---

### 2. Smooth Scroll Animations (Global)

**Files**: `src/pages/VybeDNA.tsx`, `src/components/home/AIBriefSheet.tsx`

- Add staggered `motion.div` wrappers with `initial={{ opacity: 0, y: 20 }}` / `whileInView={{ opacity: 1, y: 0 }}` / `viewport={{ once: true }}` to all section cards in VybeDNA and Brief
- Use the existing `cubic-bezier(0.16, 1, 0.3, 1)` easing from the project's motion standard

---

### 3. Daily Brief — Faster Loading + Fix Source URLs

**Problem**: Sources show `vertexaisearch.cloud.google.com` because Google Search grounding returns those proxy URLs in `groundingChunks`, not the real article URLs. The Gemini prompt asks for real URLs in the JSON output, but `groundingSources` from metadata override them.

**Fix** in `supabase/functions/ai-catch-up/index.ts`:
- Filter out any `groundingSources` that contain `vertexaisearch` or `googleapis` — these are Google's internal proxy URLs, not real sources
- Keep only the inline `item.sources` from the Gemini JSON output (which are real URLs)
- Reduce `temperature` from 0.3 to 0.2 for faster inference
- Add `responseMimeType: "application/json"` to `generationConfig` so Gemini returns structured JSON directly (faster, no markdown fences to strip)

**Fix** in `src/components/home/AIBriefSheet.tsx`:
- Show cached brief immediately while fetching fresh data in background (already partially done, but make it more aggressive — show cached data first, then silently refresh)
- Reduce geolocation timeout from 5000ms to 3000ms

---

### 4. Content Filter Toggle in DMs/Group Chats

**Existing infrastructure**: `DMImageSafetyGate` already scans images before sending. `user_safety_settings` table has `content_filter_level`. Age gating exists via `date_of_birth` on profiles.

**New behavior**:
- Both sender and receiver have content filters ON by default
- When an image is flagged by AI for the receiver, show a blurred card with the AI classification (e.g., "Flagged: Nudity") and two options: "View Anyway" / "Keep Blocked"
- Users 13+ can toggle their **receiving** filter off in chat settings
- Users under 13: filter is mandatory, no toggle shown
- Add a small shield icon toggle in the chat header that controls per-conversation content filter

**Files to change**:
- `src/components/chat/ChatView.tsx` — add receiver-side image safety gate with reveal option
- New: `src/components/chat/ReceiverImageFilter.tsx` — blurred image with classification label + reveal/keep buttons
- `src/hooks/useSafetySettings.ts` — add helper to check if user can toggle filter

**Database**: Add `dm_content_filter_enabled` boolean column to `user_safety_settings` (default true) via migration

---

### 5. Stickers System (Snapchat-style)

**New feature**: Long-press on any image in chat → "Save to Stickers" option. Stickers are stored per-user. Opening stickers panel shows saved images. Tapping a sticker sends it instantly (no confirmation).

**Database migration**:
- New `user_stickers` table: `id`, `user_id`, `image_url`, `thumbnail_url`, `created_at`
- RLS: users can only read/write their own stickers

**Files to create/change**:
- New: `src/components/chat/StickerPanel.tsx` — grid of saved stickers, tap to send instantly
- New: `src/hooks/useStickers.ts` — CRUD hooks for sticker management
- `src/components/chat/ChatView.tsx` — add "Save to Stickers" option in long-press context menu; add sticker button in chat input bar that opens the panel
- MessageBubble context menu: add "Save to Stickers" for image messages

---

### 6. Technical Details

**Migration SQL** (single migration):
```sql
-- Add DM content filter toggle
ALTER TABLE public.user_safety_settings 
ADD COLUMN IF NOT EXISTS dm_content_filter_enabled boolean DEFAULT true;

-- Create stickers table
CREATE TABLE public.user_stickers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_stickers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own stickers"
  ON public.user_stickers FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

**Edge function redeployment**: `ai-catch-up` with the vertex URL filtering fix

**Files changed**: ~8 files modified, ~3 new files created


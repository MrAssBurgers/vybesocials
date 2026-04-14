

## 3-Step Vybe Check — Content Safety + Age Rating System

### What Changes

The posting flow gets a redesigned full-screen **3-phase Vybe Check** overlay that replaces the current single-step spinner. Nudity is always blocked — no age rating bypasses it.

### The 3 Phases

**Phase 1 — Content Scan** ("Scanning your VYBE...")
- Animated shield icon with scanning ring animation
- Progress steps: Quick Scan → Deep Analysis → (Audio Check for video)
- Uses existing AI safety pipeline (NSFWJS + Gemini)
- If blocked → stops here, shows VybeCheckFailed
- If passed → auto-transitions to Phase 2

**Phase 2 — Age Rating Selection** ("Who can see this?")
- Three tappable cards slide in with stagger animation:
  - **Safe** (green) — All ages, appears in everyone's feed
  - **13+** (amber) — Teen content, hidden from users under 13
  - **18+** (red) — Mature content (language, themes), hidden from users under 18
- Nudity callout: small disclaimer "Nudity is never allowed on VYBE" under the cards
- User taps one → it highlights with a glow ring → auto-advances to Phase 3

**Phase 3 — Ready to Launch** ("Your VYBE is ready!")
- Green checkmark animation with the chosen age badge displayed
- "Publish" button with rocket animation
- Tapping publish triggers the existing upload flow + PublishCelebration

### Database Changes

1. **Add `age_rating` column to `posts` table** — `text NOT NULL DEFAULT 'safe'` with check constraint for values `safe`, `13+`, `18+`
2. **Feed filtering** — Modify feed queries to filter posts based on viewer's age (calculated from `date_of_birth` on their profile)

### Technical Details

**Files modified:**
- `src/components/create/MobilePostComposer.tsx` — Replace inline safety scanner overlay with new `VybeCheckOverlay` component; pass selected age rating to `createPost`
- `src/hooks/usePosts.ts` — Add `age_rating` param to `createPost` mutation
- `src/hooks/useFeedAlgorithm.ts` — Filter posts by viewer age vs post age_rating

**New files:**
- `src/components/safety/VybeCheckOverlay.tsx` — Full-screen 3-phase component managing scan → rating → confirm flow
- `src/components/safety/AgeRatingSelector.tsx` — The three tappable age rating cards

**What stays the same:**
- All existing safety scanning logic (useContentSafety, aiSafetyClient, nsfwScanner)
- VybeCheckFailed component for blocked content
- PublishCelebration for upload progress
- Owner bypass (skips all 3 phases)

### Migration
```sql
ALTER TABLE public.posts ADD COLUMN age_rating text NOT NULL DEFAULT 'safe';
ALTER TABLE public.posts ADD CONSTRAINT posts_age_rating_check 
  CHECK (age_rating IN ('safe', '13+', '18+'));
```


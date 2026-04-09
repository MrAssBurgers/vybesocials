

## Plan: Fix VybeDNA Scroll, Locker Shop Route, Daily Brief, QuickAdd Mouse Scroll

### 1. VybeDNA Page — Fix Scrolling

**Problem**: The page uses `min-h-full` which doesn't create enough scrollable height inside AppLayout's overflow container. Content below the fold is unreachable.

**Fix** in `src/pages/VybeDNA.tsx`:
- Change outer `div` from `min-h-full pb-24` to `min-h-screen pb-24 overflow-y-auto`
- This ensures the page content extends beyond the viewport and the AppLayout scroll container can scroll it

### 2. Profile Locker Shop — Route to /marketplace

**Problem**: The `ShopContent` component in `src/components/profile/ProfileLocker.tsx` shows a static "Coming Soon" placeholder, but `/marketplace` already exists.

**Fix** in `src/components/profile/ProfileLocker.tsx`:
- Replace the `ShopContent` component body with a button/link that navigates to `/marketplace`
- Keep the shop emoji and title but replace "Coming Soon" with a "Browse Shop" button using `useNavigate`

### 3. Daily Brief — Redeploy Edge Function + Enhance News Cards

**Problem**: Edge function logs show the **old version** is still deployed — `JSON.parse` fails at line 84 (old code) instead of line 116 (new code with sanitization). The sanitization fix from the last change was never deployed. Additionally, Gemini is intermittently returning 503 errors.

**Fix**:
- **Redeploy** `ai-catch-up` edge function so the sanitization + token limit fix goes live
- **Add retry logic** in the edge function: if Gemini returns 503, retry once after 2 seconds
- **Enhance NewsCard** in `AIBriefSheet.tsx` to be more Samsung Brief-like:
  - Larger hero image (h-36 instead of h-28)
  - Show full summary on tap with smooth expand animation (already exists but make it more prominent)
  - Show source favicons more prominently with domain names visible
  - Add a "Read more" indicator on collapsed cards

### 4. QuickAddRow — Mouse Wheel Horizontal Scroll

**Problem**: The horizontal scroll row of online friends only scrolls via touch drag. Desktop users with a mouse wheel can't scroll it.

**Fix** in `src/components/chat/QuickAddRow.tsx`:
- Add an `onWheel` handler to the scrollable container that converts vertical scroll delta into horizontal scroll:
```typescript
onWheel={(e) => {
  if (e.deltaY !== 0) {
    e.currentTarget.scrollLeft += e.deltaY;
    e.preventDefault();
  }
}}
```

### Files to Change

| File | Change |
|------|--------|
| `src/pages/VybeDNA.tsx` | Fix outer container to allow scrolling |
| `src/components/profile/ProfileLocker.tsx` | Replace "Coming Soon" with link to `/marketplace` |
| `supabase/functions/ai-catch-up/index.ts` | Add retry on 503 errors + redeploy |
| `src/components/home/AIBriefSheet.tsx` | Enhance NewsCard to Samsung Brief style |
| `src/components/chat/QuickAddRow.tsx` | Add `onWheel` horizontal scroll handler |

### No database changes needed.


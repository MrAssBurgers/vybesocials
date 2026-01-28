

# Implementation Plan: Fix Clips in Home, DMs, and Background Image

## Status: ✅ COMPLETED

All four issues have been implemented:

---

## 1. Remove Clips from Home Feed ✅

**Solution Applied:**
Modified `src/pages/Home.tsx` to filter out posts with `type === 'short'` from both the For You and Following feeds:

```typescript
const forYouPosts = useMemo(() => 
  (forYouData?.pages.flatMap(page => page.posts) || [])
    .filter(post => post.type !== 'short'), 
  [forYouData]
);
```

---

## 2. Explore Page Tab Switcher with Persistence ✅

**Solution Applied:**
- Added `ExploreTabBar` component with pill-style tabs at the top
- Tab selection is persisted to `localStorage` with key `explore-view-mode`
- On page load, checks URL param first, then localStorage, defaults to 'clips'
- Removed bottom floating buttons, replaced with top tab bar

---

## 3. Fix DMs Conversation List ✅

**Solution Applied:**
Fixed the query in `src/hooks/useMessages.ts`. The issue was that it was fetching ALL conversations then filtering, but due to RLS it wasn't getting results. Now it:
1. First fetches conversation IDs the user is a member of from `conversation_members`
2. Then queries conversations with `.in('id', userConversationIds)` filter

---

## 4. Fix Background Image Visibility ✅

**Solution Applied:**
Restructured CSS layering in `src/index.css`:
- Made `body` transparent when `html[data-has-bg-image="true"]` is set
- Moved background image to `#root::before` at `z-index: 0`
- Added subtle overlay on `#root::after` at `z-index: 1` for readability
- Ensured all content (`#root > *`) is at `z-index: 2`
- Increased default opacity from 0.5 to 0.85 for better visibility
- Reduced overlay opacity from 0.5-0.7 to 0.05-0.15 for clearer background

---

## Files Modified

| File | Changes |
|------|---------|
| `src/index.css` | Restructured background layer hierarchy |
| `src/pages/Home.tsx` | Filter out 'short' type posts |
| `src/pages/Explore.tsx` | Added top tab switcher with localStorage persistence |
| `src/hooks/useMessages.ts` | Fixed conversation query to filter by membership |

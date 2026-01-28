

# Implementation Plan: Fix Clips in Home, DMs, and Background Image

## Overview

This plan addresses four connected issues:
1. Remove clips (shorts) from the Home feed - they should only appear in the Clips section
2. Add a nice tab switcher at the top of the Explore page with persistence
3. Fix DMs so conversations and profiles display correctly
4. Fix background image layering so custom backgrounds are visible

---

## 1. Remove Clips from Home Feed

### Problem
The Home page fetches posts using `useInfinitePosts()` without filtering by type, so short-form clips appear alongside regular posts.

### Solution
Modify the `useInfinitePosts` hook call on the Home page to filter OUT posts with type 'short'.

**Files to modify:**
- `src/pages/Home.tsx` - Pass type filter to exclude shorts

**Changes:**
- Update `useInfinitePosts()` and `useInfiniteFollowingPosts()` calls to use a new `excludeType` parameter OR filter client-side
- Alternatively, create a new hook or parameter that filters to only show 'post' type content

**Technical approach:**
Either update the database function to support excluding types, or filter client-side when processing posts:
```typescript
const forYouPosts = useMemo(() => 
  (forYouData?.pages.flatMap(page => page.posts) || [])
    .filter(post => post.type !== 'short'), 
  [forYouData]
);
```

---

## 2. Explore Page Tab Switcher with Persistence

### Problem
- The "Switch to Videos/Clips" button is at the bottom and not very discoverable
- User's selection doesn't persist when they leave and return

### Solution
Add a proper tab switcher at the TOP of the Explore page and persist the selection to localStorage.

**Files to modify:**
- `src/pages/Explore.tsx` - Add top tab bar, persist selection

**Changes:**
1. Add a styled tab bar at the top of both Clips and Videos views with "Clips" and "Videos" tabs
2. Save selection to localStorage when changed
3. Initialize from localStorage on mount
4. Use a nice pill-style tab design that matches the app's aesthetic

**Technical approach:**
```typescript
// Read from localStorage on mount
const [viewMode, setViewMode] = useState<'clips' | 'videos'>(() => {
  const saved = localStorage.getItem('explore-view-mode');
  return (saved as 'clips' | 'videos') || 'clips';
});

// Save to localStorage on change
useEffect(() => {
  localStorage.setItem('explore-view-mode', viewMode);
}, [viewMode]);
```

---

## 3. Fix DMs Conversation List

### Problem
The conversation list appears empty (screenshot shows only the AI chat bot, no human conversations).

### Solution
Investigate and fix why conversations aren't loading. Likely causes:
- RLS policy blocking access to conversations
- The `useConversations` query not returning data
- Profile data not being fetched correctly

**Files to investigate/modify:**
- `src/hooks/useMessages.ts` - Check the query
- Check RLS policies on `conversations` and `conversation_members` tables

**Technical approach:**
1. Check if the user is actually in any conversations in the database
2. Verify RLS policies allow reading own conversations
3. Ensure the join with `profiles` works correctly
4. Add better error handling/debugging

**Database query to verify:**
```sql
SELECT * FROM conversation_members 
WHERE user_id = 'current_user_profile_id';
```

---

## 4. Fix Background Image Visibility

### Problem
When a user uploads a background image:
- "Background applied" toast shows
- But the app still shows a black/dark background
- The image is applied to a layer that's covered by the body's gradient

### Solution
Restructure the CSS layering so background images are visible:

1. Make body background transparent when a custom image is active
2. Move background image rendering to a higher layer (`#root::before`)
3. Ensure UI content floats above the background

**Files to modify:**
- `src/index.css` - Fix layering hierarchy
- `src/hooks/useCustomTheme.ts` - Ensure CSS variables are set correctly

**CSS Layer Hierarchy (top to bottom):**
1. UI Content (z-index: 2) - posts, cards, nav
2. Readability Overlay (z-index: 1) - semi-transparent gradient
3. Background Image (z-index: 0) - custom user image
4. Body Background - solid fallback only

**Key CSS changes:**
```css
/* When custom background is active, make body transparent */
html[data-has-bg-image="true"] body {
  background: transparent !important;
}

/* Move background to #root::before which is above body */
html[data-has-bg-image="true"] #root::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  background-image: var(--bg-image-url);
  background-size: cover;
  background-position: center;
}

/* Ensure all content is above the background */
#root > * {
  position: relative;
  z-index: 2;
}
```

---

## Implementation Order

1. **Background image fix** - Critical visual bug
2. **Home feed clips filter** - Simple change, high impact
3. **Explore tab persistence** - UX improvement
4. **DMs investigation** - Requires debugging to find root cause

---

## Files Summary

| File | Changes |
|------|---------|
| `src/index.css` | Restructure background layer hierarchy, make body transparent when bg image active |
| `src/pages/Home.tsx` | Filter out 'short' type posts from both feeds |
| `src/pages/Explore.tsx` | Add top tab switcher, persist selection to localStorage |
| `src/hooks/useMessages.ts` | Debug/fix conversation fetching (if DB issue found) |
| Possible DB migration | Fix RLS policies if conversations aren't loading |

---

## Technical Notes

- The `data-has-bg-image` attribute is already being set on the HTML element when a background is active
- The `--bg-image-url` CSS variable is already being set with the image URL
- The current issue is purely a CSS layering problem where the body's gradient covers the pseudo-element
- For DMs, will need to query the database to see if any conversations exist for the current user


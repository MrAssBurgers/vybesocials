

## Plan: Fix Profile Mobile Sizing & Global Layout Polish

### Problem
On mobile (390px viewport), the profile page has several layout issues:
1. **Display name clips off the left edge** — centered text can overflow when names + badges are wide
2. **Action buttons overflow right** — "Edit Profile", "Share", "Manage Premium" don't wrap, causing horizontal cutoff
3. **Stats + Engagement row can overflow** — the stats and engagement score sit in a non-wrapping flex row
4. **No horizontal overflow protection** — the page container doesn't prevent content from bleeding out

### Changes

**File: `src/pages/Profile.tsx`**

1. **Add `flex-wrap` to the own-profile action buttons** (line ~351): Wrap `flex gap-2` → `flex flex-wrap gap-2 justify-center` so buttons stack gracefully on narrow screens

2. **Add `flex-wrap` to other-user action buttons** (line ~396): Same treatment for Follow/Message/Gift buttons

3. **Add `overflow-hidden` to the page container** (line 252): Add `overflow-x-hidden` to the outer `div` to prevent any horizontal scroll bleed

4. **Wrap stats + engagement row** (line ~459): Add `flex-wrap` so the engagement score wraps below stats on very narrow screens

5. **Constrain display name width**: Add `max-w-full overflow-hidden` to the name container (line ~289) and `truncate` or `break-words` to prevent long names + badges from overflowing

6. **Fix button sizing on mobile**: Make "Manage Premium" / "Edit Profile" buttons use `text-xs` on mobile to fit better, or allow them to stack vertically

### Other Pages — Quick Scan Fixes

7. **`src/components/layout/AppLayout.tsx`**: Add `overflow-x-hidden` to the mobile outer wrapper (line 106) to globally prevent horizontal overflow on all pages

### No database changes needed.

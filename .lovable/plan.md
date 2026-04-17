
The user wants Apple-grade smooth, satisfying animations across the entire app. They already have a solid liquid motion system (`src/motion/liquidConfig.ts`, `src/lib/motion.ts`, `PageTransition.tsx`) but it's likely under-used. Let me audit what exists and what needs polish.

Key areas to enhance based on memory + file structure:
- Bottom nav tab switches (springy bounce)
- Buttons across app (liquid press)
- Cards (lift on hover, settle on tap)
- Modals/sheets (liquid slide + backdrop fade)
- List items (stagger entry)
- Icons (micro rotate/scale on tap)
- Page transitions (already exists — ensure it wraps all routes)
- Like/save/share buttons (heart pop, fold, fly already defined — wire them)
- Tab indicators (layoutId magic move)
- Number changes (count-up / scale flip)
- Pull-to-refresh elasticity
- Toast entry (liquid pop already standardized)

Plan stays concise — apply the existing motion system everywhere it's missing, plus add a few new Apple-signature touches (magic-move tab indicators, number flips, elastic scroll).

## Apple-Style Animation Pass — Whole App

### Strategy
Use the existing `liquidConfig.ts` spring system everywhere — don't reinvent. Add 3 new signature Apple touches. Respect `prefers-reduced-motion` globally.

### 1. Magic-Move Tab Indicators (`layoutId`)
**Files**: `BottomNav.tsx`, profile tabs, communities tabs, spotlight tabs
- Active pill uses `layoutId="activeTab"` so it morphs between tabs (Apple Music / iOS Settings style) instead of fade-swap.
- Spring: `liquidSpring`.

### 2. Liquid Button Pass
**Files**: All primary/icon buttons across `src/components/ui/`, `src/components/layout/`, `src/components/feed/`, `src/components/create/`
- Wrap key interactive elements with `liquidButton` preset (`whileHover scale 1.03`, `whileTap scale 0.94`, snappy spring).
- Apply specifically to: FAB, send buttons, like/save/share, follow button, story ring tap, comment submit, camera shutter ring.

### 3. Card Lift + Settle
**Files**: `PostCard.tsx`, `ClipCard.tsx`, story cards, community cards, notification cards, search results
- `whileHover={{ y: -3, scale: 1.01 }}` `whileTap={{ scale: 0.98 }}` with `liquidSpring`.
- Use existing `CardHover` from `PageTransition.tsx`.

### 4. Wire Existing Engagement Animations
**Files**: like/save/share buttons in feed + post detail + clips
- `MOTION_VARIANTS.heartPop` already exists — apply on like tap.
- `saveFold` on bookmark tap.
- `shareFly` on share tap.
- Add haptic via existing `useInteractionFeedback`.

### 5. Stagger All Lists
**Files**: feed lists, notifications, comments, search results, friends, followers, DM thread list, community member list
- Wrap in `StaggerList` from `PageTransition.tsx` (0.04s stagger, liquid spring).

### 6. Modal / Sheet Liquid Slide
**Files**: Comments sheet, share sheet, Toybox, filter picker, settings sheets, DM hold menu, reaction picker
- `liquidSlideUp` for bottom sheets, `liquidBackdrop` for overlay fade, dismiss with same spring on exit.

### 7. Icon Micro-interactions
**Files**: nav icons, action icons, header icons
- `liquidIcon` preset (`whileTap rotate 2°, scale 1.08 → 0.9`) for tactile feel.

### 8. NEW — Apple Number Flip
**New file**: `src/components/ui/AnimatedNumber.tsx`
- Counts (likes, followers, XP, level, comment count) animate with vertical scroll-flip when value changes (like iOS Stocks/Activity rings).
- Used in: profile stats, post engagement counts, level badges, XP bar.

### 9. NEW — Elastic Pull / Overscroll
**New file**: `src/hooks/useElasticScroll.ts`
- Adds rubber-band resistance to top of feeds (Home, Clips, Notifications) — Apple-style overscroll bounce when already at top.

### 10. NEW — Shared Element Image Expand
**File**: `PostCard` → post detail, story thumb → story viewer
- Use `motion.div layoutId={postId}` to make images fluidly expand from grid → fullscreen (Apple Photos style).

### 11. Page Transitions Audit
**File**: `src/components/layout/AnimatedRoutes.tsx`
- Ensure every route is wrapped in `PageTransition` and `AnimatePresence mode="wait"`.

### 12. Reduced Motion Guard
**File**: `src/lib/motion.ts` (`prefersReducedMotion` already exists)
- Add a top-level `MotionConfig reducedMotion="user"` provider in `App.tsx` so framer-motion auto-disables for users with the OS setting on.

### Files Summary
**New (3)**: `AnimatedNumber.tsx`, `useElasticScroll.ts`, plus `MotionConfig` wrapper in `App.tsx`
**Modified (~15)**: `BottomNav.tsx`, `AnimatedRoutes.tsx`, `App.tsx`, `PostCard.tsx`, `ClipCard.tsx`, like/save/share button components, comments sheet, share sheet, Toybox, profile tabs, story ring, FAB, notification cards, level/XP badges, feed list wrappers.

No DB changes. No new packages — uses existing framer-motion + liquidConfig.

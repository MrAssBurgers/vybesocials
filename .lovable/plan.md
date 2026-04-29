# Make VYBE scroll smooth as butter

The app feels jittery because of three compounding issues found across the codebase:

1. **400+ `backdrop-blur` usages** (cards, nav, sheets, badges) all repaint every scroll frame. Safari/Chromium can't composite blur, so each frame triggers a full GPU recomposite of overlapping layers.
2. **169 components use `transition-all`**, which animates every property change (including layout) on hover/state change — expensive and easy to accidentally trigger mid-scroll.
3. The existing `useScrollOptimization` hook adds `.is-scrolling` to suppress some animations, but **only after a scroll starts** (after the first jank frame) and it doesn't suppress `backdrop-filter` itself — the heaviest cost.

## Plan

### 1. Kill backdrop-blur during scroll (biggest win)

In `src/index.css`, extend the existing `.is-scrolling` ruleset so all glass surfaces drop their filter while the user is actively scrolling and restore it on idle:

```css
html.is-scrolling [class*="backdrop-blur"],
html.is-scrolling .liquid-glass,
html.is-scrolling .liquid-glass-card,
html.is-scrolling .liquid-glass-button,
html.is-scrolling .liquid-glass-depth,
html.is-scrolling .glass-card {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  transition: none !important;
}
```

This is invisible to the user (motion masks it) and recovers ~40–60% scroll cost on blur-heavy pages (Home, Profile, Messages).

### 2. Make `useScrollOptimization` proactive + tuned

Edit `src/hooks/useScrollOptimization.ts`:
- Attach the `.is-scrolling` class on `pointerdown` / `touchstart` / `wheel` (not just on the first scroll event) so the **first frame is already optimized**.
- Replace the 100 ms idle timeout with rAF-based settle (2 idle frames) — feels snappier.
- Listen on `window`, `document`, and any element with `data-scroller="true"` so internal scroll containers also benefit.

### 3. Promote scrollable containers to their own GPU layer

Add a global utility class `.scroller` and apply it to the main scroll regions (`AppLayout` main, `Messages` thread, `Profile` feed, `Explore` grid):

```css
.scroller {
  contain: layout paint style;
  content-visibility: auto;
  contain-intrinsic-size: 1px 1000px;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  transform: translateZ(0);
}
```

`content-visibility: auto` skips offscreen post rendering — huge win on long feeds.

### 4. Replace `transition-all` in scroll-visible components

Audit the 10 hottest offenders surfaced by ripgrep (`PostCard`, `ShortCard`, `MobileShortCard`, `BottomNav`, `HomeWidgetRenderer`, `Sidebar`, `Explore`, `DesktopRightSidebar`, `PostCarousel`, `AIBriefSheet`) and narrow `transition-all` → `transition-colors`, `transition-transform`, or `transition-opacity` so only the property in motion is animated. (≈30 targeted replacements; not a sweeping refactor.)

### 5. Throttle background-effect particle loops while scrolling

`src/components/effects/BackgroundEffects.tsx` runs CSS keyframe animations on 8–12 absolutely-positioned elements. Add `html.is-scrolling .bg-effect-particle { animation-play-state: paused; }` and tag the elements with that class. Pauses cost 0 frames and resumes the moment scroll stops.

### 6. Remove permanent `will-change` 

`will-change: transform` is left on `.liquid-parallax-*` and several notification overlays even when offscreen. That keeps a GPU layer alive forever. Switch to applying `will-change` only on hover/active and removing it after the transition (`onTransitionEnd`).

### 7. Disable framer-motion layout animations in lists

In `PostCard.tsx`, `ClipsGrid.tsx`, `NotificationList`, replace `<motion.div layout>` with plain `<div>` for the list containers. `layout` re-measures every child every frame during scroll — a known jank source. Keep `layout` only on small interactive areas (reactions tray).

### 8. Cap framer-motion `MotionConfig`

In `src/App.tsx` wrap the tree with:
```tsx
<MotionConfig reducedMotion="user" transition={{ type: 'tween', duration: 0.2 }}>
```
Using `tween` instead of the default spring removes per-frame physics calculations app-wide.

## Files to edit

- `src/index.css` — add `.is-scrolling` blur kill + `.scroller` utility (sections 1, 3, 5)
- `src/hooks/useScrollOptimization.ts` — proactive listeners + rAF settle (section 2)
- `src/components/effects/BackgroundEffects.tsx` — pause class on particles (section 5)
- `src/styles/liquid.css` — remove unconditional `will-change` (section 6)
- `src/components/layout/AppLayout.tsx`, `src/pages/Messages.tsx`, `src/pages/Explore.tsx`, `src/pages/Profile.tsx` — add `.scroller` to main scroll regions (section 3)
- `src/components/posts/PostCard.tsx`, `ShortCard.tsx`, `MobileShortCard.tsx`, `PostCarousel.tsx`, `BottomNav.tsx`, `HomeWidgetRenderer.tsx`, `Sidebar.tsx`, `DesktopRightSidebar.tsx`, `AIBriefSheet.tsx`, `Explore.tsx` — narrow `transition-all` → specific properties; drop `motion.div layout` from list containers (sections 4, 7)
- `src/App.tsx` — `MotionConfig` defaults (section 8)

## Out of scope

- Reducing the 400+ blur surfaces app-wide (visual identity change — would need your sign-off separately).
- Replacing framer-motion with CSS for non-list animations.
- Image/video lazy-loading changes (already tuned in `performanceConfig.ts`).

Expected result: scrolling on Home, Profile, Messages, and Explore should hit 60 fps on iOS Safari and Android Chrome, with no visual regression once scroll stops.

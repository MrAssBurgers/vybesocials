

## Speed Up & Smooth Out the App

### Root Causes Identified

1. **`backdrop-blur` everywhere** — 167 files use `backdrop-blur`. Every blurred element forces the GPU to re-sample all pixels underneath on every frame. The bottom nav, tab bar, close buttons, toasts, and modals all stack blur layers during scroll and video playback.

2. **Too many concurrent CSS animations** — Background effects (particles, stars, aurora, rain, bubbles) run 20-40 animated DOM elements simultaneously with `box-shadow` animations. The `gradient-shift`, `premium-gold-shimmer`, shimmer-sweep, and various pulse/glow keyframes all run constantly even when off-screen.

3. **`is-scrolling` pointer-events hack** — Lines 2049-2052 disable `pointer-events` on `.post-card` and `article` during scroll. This forces layout recalculation and can cause visible "flash" jank on mobile.

4. **Framer Motion overhead on clips** — Both `ShortCard` (716 lines) and `MobileShortCard` (596 lines) import framer-motion with `AnimatePresence` for every clip in the scroll. Each clip creates multiple `motion.div` elements that run spring animations during snap-scroll.

5. **Explore page re-renders** — `usePosts()` fetches all posts, then filters client-side into clips/videos. `trendingCreators` and `trendingTags` are recomputed from the full post array on every render cycle.

6. **Console error: ModeratorDialogs ref warning** — `ModeratorDialogs` is a function component used inside `ShortCard` that receives a ref but doesn't use `forwardRef`, causing repeated warnings.

### Plan

**1. Replace `backdrop-blur` on high-frequency elements with solid backgrounds**
- Bottom nav (`BottomNav.tsx`): Replace `backdropFilter: 'blur(24px)'` with a fully opaque `hsl(var(--card))` background. The gradient overlay already provides visual depth.
- Clips close button (`Explore.tsx` line 313): Replace `backdrop-blur-md` with `bg-black/80` 
- ExploreTabBar (`Explore.tsx` line 78): Replace `backdrop-blur-xl` with solid `bg-card`
- Toast system (`index.css` ~line 2855): Remove `backdrop-filter: blur(20px)` from `.toast-pill`

**2. Reduce BackgroundEffects particle counts and remove box-shadow animations**
- `BackgroundEffects.tsx`: Reduce particles from 20→8, stars from 35→12, rain drops from 40→15, bubbles from 10→5
- Remove `boxShadow` from particle/star inline styles (box-shadow animation is extremely expensive)
- Add `contain: strict` to the root background effects container

**3. Remove the pointer-events scroll hack**
- Delete lines 2047-2052 in `index.css` (`.is-scrolling .post-card, .is-scrolling article { pointer-events: none }`) — this causes more jank than it prevents

**4. Add `content-visibility: auto` to off-screen clips**
- In both `Shorts.tsx` and `Explore.tsx` clip containers, add `content-visibility: auto` and `contain-intrinsic-size` to clip wrapper divs so the browser skips rendering off-screen clips entirely

**5. Fix ModeratorDialogs ref warning**
- `ModeratorActionsMenu.tsx`: Wrap `ModeratorDialogs` in `forwardRef`

**6. Add CSS `contain` to post cards for layout isolation**
- Add `.post-card { contain: layout style paint; }` to index.css so layout changes in one card don't trigger reflow in others

### Files to modify
- `src/index.css` — Remove pointer-events hack, add contain rules, remove toast blur, optimize animation selectors
- `src/components/layout/BottomNav.tsx` — Replace backdrop-blur with opaque background
- `src/components/effects/BackgroundEffects.tsx` — Reduce particle counts, remove box-shadow animations
- `src/pages/Explore.tsx` — Replace backdrop-blur on tab bar and close buttons, add content-visibility to clip wrappers
- `src/pages/Shorts.tsx` — Add content-visibility to clip wrappers
- `src/components/moderation/ModeratorActionsMenu.tsx` — Wrap ModeratorDialogs in forwardRef


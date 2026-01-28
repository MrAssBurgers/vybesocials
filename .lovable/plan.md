
Goal outcomes (what you’ll see after the fix)
- Bottom nav is back on tablets + phones (and never shows on desktop).
- Bottom nav stays visible in normal sections (Home/Explore/Messages/Profile/Community/etc). No “scroll-to-hide” behavior that makes it feel gone.
- The “black block” at the bottom-left disappears (it’s the reserved bottom padding showing when the nav is hidden/offscreen).
- Scrolling + animations feel smoother (especially on tablet) and the app stops doing “app-wide re-renders” during scroll.

What’s actually going wrong (root cause)
1) The bottom nav is being mounted (your logs confirm `shouldRender: true` on tablet), but it can still be visually hidden because BottomNav currently includes “hide while scrolling down” logic (translateY(100%) + opacity 0).  
   - On tablet, users tend to “swipe up” (scroll down) a lot, which keeps it hidden.
   - This also creates the “black block” because AppLayout always reserves bottom space (`pb-[calc(5rem+...)]`) even when the nav has slid offscreen, leaving a blank area.

2) Performance/glitchiness is being amplified by `GlassIntensityProvider` updating React state on every scroll tick. That causes many components (especially glass cards) to re-render repeatedly while you scroll → jitter + slow interactions.

Implementation plan (no fluff, just the steps)
A) Bring back bottom nav (tablet/mobile only) and keep it visible
1. Remove “scroll-to-hide” behavior from BottomNav
   - In `src/components/layout/BottomNav.tsx`:
     - Remove/disable `useScrollDirection()` and the `scrollVisibility` singleton.
     - Make nav visibility depend only on the centralized `navVisibility` store (community input / chat hides) and route rules from `RootBottomNavMount`.
     - Keep a simple, performant animation for appearance (CSS transition or a single framer-motion mount animation), but do not hide on scroll.
   - Result: on tablet, “swipe up” won’t make it disappear.

2. Make the “black block” impossible even if nav is hidden on specific routes
   - In `src/components/layout/AppLayout.tsx`:
     - Replace the hard-coded bottom padding (`pb-[calc(5rem+env(...))]`) with a CSS variable (example: `--bottom-nav-space`).
   - In `src/components/layout/RootBottomNavMount.tsx`:
     - When nav is rendered, set `document.documentElement.style.setProperty('--bottom-nav-space', '5rem')`
     - When nav is not rendered (desktop / hidden routes / immersive routes), set it to `0px`
   - Result: no more empty black “reserved” area when nav isn’t present.

3. Make tablet detection consistent and reliable (especially for Android tablets)
   - Right now you have two parallel device systems: `useIsMobileOrTablet()` and `useBreakpoint()` / `usePlatform()`.
   - We’ll unify the decision rule used by `RootBottomNavMount` so tablet doesn’t accidentally fall into “desktop sidebar” mode.
   - In `src/hooks/usePlatform.ts` (and/or `use-mobile.tsx`):
     - Expand “tablet” detection for large tablets (up to 1366px) when the primary pointer is coarse OR hover is none OR there are multiple touch points.
     - Keep desktop as “no-touch or hover+fine pointer + large width”.
   - Result: iPad + Android tablets consistently get bottom nav; desktops (even small windows) keep sidebars.

B) Smooth everything (major performance wins with minimal risk)
4. Stop app-wide re-renders during scroll (biggest performance fix)
   - In `src/components/ui/glass/GlassIntensityProvider.tsx`:
     - Remove the `setIsScrolling(true/false)` state updates inside the scroll handler.
     - Keep only the DOM class toggle (`document.documentElement.classList.add/remove('is-scrolling')`) OR rely entirely on `useScrollOptimization()` (preferred: one source of truth).
     - Keep `intensity/contrast` in context, but make `isScrolling` either:
       - removed from the context value entirely, or
       - a stable value that does not change on scroll.
   - In `src/components/ui/glass/GlassCard.tsx`:
     - Stop reading `isScrolling` from context (so it doesn’t re-render on scroll).
     - Use CSS to pause glass animations during `.is-scrolling` if needed.

5. Reduce expensive visual effects on tablet / low-perf devices using existing CSS hooks
   - You already have `.perf-low/.perf-medium` rules in `src/index.css`, but they’re only useful if the class is applied.
   - In `src/App.tsx`:
     - Add `PlatformProvider` near the top of the tree (it applies `device-*` + `perf-*` classes to `<html>`).
   - In `src/index.css`:
     - Add a tablet-specific rule to avoid `background-attachment: fixed` on background images for tablets too (not only `<768px>`), because fixed+blur is a known jank source on iPad/tablets.
   - Result: fewer “glitchy” frames and faster scrolling.

C) Verification checklist (manual)
6. Bottom nav visibility
   - Tablet preview: `/home`, `/explore`, `/messages`, `/community`, `/settings` → bottom nav visible
   - Desktop preview: bottom nav never appears, sidebars remain
   - Hidden routes: `/upload`, `/camera`, `/onboarding` → bottom nav hidden and NO bottom black gap

7. Nav doesn’t vanish on scroll
   - On tablet, scroll down a long feed: nav remains visible

8. Performance sanity
   - Scroll Home feed on tablet: no stutter spikes from glass re-renders
   - Open/close modals: no stuck overlays, no scroll lock issues

Files expected to change (so you know what’s being touched)
- `src/components/layout/BottomNav.tsx` (remove scroll-to-hide; keep clean animations)
- `src/components/layout/RootBottomNavMount.tsx` (set `--bottom-nav-space`, remove debug logging after verification)
- `src/components/layout/AppLayout.tsx` (use the CSS variable for padding)
- `src/hooks/usePlatform.ts` and/or `src/hooks/use-mobile.tsx` (unify tablet detection)
- `src/components/ui/glass/GlassIntensityProvider.tsx` (remove scroll-driven state updates)
- `src/components/ui/glass/GlassCard.tsx` (stop subscribing to scroll state)
- `src/index.css` (tablet background-attachment fix; optional `.is-scrolling` pausing rules)
- `src/App.tsx` (add `PlatformProvider` so perf/device classes actually apply)

Risk management / why this won’t break things
- Bottom nav changes are isolated to visibility logic and padding; route behavior remains governed by existing `RootBottomNavMount` rules.
- Removing scroll-driven context updates is a net win and reduces global render churn; UI should remain visually identical except smoother.
- We keep `navVisibility` intact so community chat/input can still hide the nav intentionally.

After you approve
- I’ll implement the above, then we’ll re-check the `[BottomNavMount]` log once, and I’ll remove the debug logging so it doesn’t spam the console.

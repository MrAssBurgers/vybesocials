I found the scrolling issue is tied to the existing scroll optimization system: while scrolling, the app adds an `is-scrolling` class and CSS temporarily disables glass blur and replaces translucent surfaces with darker fallback gradients. That makes the UI visibly darken/flicker during scrolling and can feel broken.

Plan:

1. Remove the scroll-time darkening
   - Update `src/index.css` so `html.is-scrolling .liquid-glass*` no longer swaps glass cards to dark opaque fallback gradients.
   - Keep safe performance optimizations where possible, but do not visually change cards/nav/sidebar while scrolling.
   - Preserve readability and the contrast auto-guard that was just added.

2. Make scroll state less aggressive
   - Update `src/hooks/useScrollOptimization.ts` so it marks `is-scrolling` only for real scroll movement, touchmove, or wheel scrolling, not every pointer down/tap.
   - This prevents normal taps/clicks from triggering scroll-mode visual changes.

3. Avoid duplicate scroll-state systems fighting each other
   - Update `src/components/ui/glass/GlassIntensityProvider.tsx` so it no longer independently adds/removes the same `is-scrolling` class, or make it delegate to the shared scroll optimization behavior.
   - This avoids timing conflicts where one listener keeps scroll mode active longer than expected.

4. Verify on the current route
   - Test the home feed at the user’s current viewport size.
   - Scroll the main feed and confirm it behaves normally: no darkening, no stuck state, and scrolling still works in the main feed/right sidebar.
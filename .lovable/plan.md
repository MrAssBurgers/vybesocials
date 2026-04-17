

## What I'll fix

### 1. Email domain — already configured ✅
The domain `notify.vybehub.app` IS verified. The Cloud → Emails view banner says "no default email domain configured" because no domain is selected as the project default. I'll surface a button so you can confirm/select it. (Tool action, no code change.)

### 2. Yellow tap-highlight overlay (iPad on login + create menu)
**Root cause:** iOS/iPadOS Safari paints a translucent **yellow/orange tap-highlight** on `<button>`, `<a>`, and `motion.button` elements during touch. The global rule `body { -webkit-tap-highlight-color: transparent }` is set in `index.html`, but Framer Motion's `motion.button` and several inline buttons override it with their own stacking contexts so the highlight bleeds through on iPadOS specifically.

**Fix in `src/index.css`:** Strengthen the global tap-highlight reset so it covers ALL interactive elements and Framer Motion wrappers (not just `<a>/<button>` under 1024px):

```css
*, *::before, *::after {
  -webkit-tap-highlight-color: transparent;
}
button, a, [role="button"], [data-framer-motion], .motion-button,
input, textarea, select, label {
  -webkit-tap-highlight-color: rgba(0,0,0,0) !important;
  -webkit-touch-callout: none;
}
```

Also wrap login form buttons + `CreateMenuLayer` action buttons in `touch-manipulation` class (already defined) for good measure.

### 3. Broken/torn gradient on Create (+) button tap
**Root cause in `src/components/layout/BottomNav.tsx` (lines 573-595):** The Create button has a `radial-gradient` blob positioned at `inset: -6` with `filter: blur(14px)`, PLUS an animated overlay on open with `filter: blur(12px)` and `scale: 1.5`. On iPad Safari, **filter: blur** + framer-motion `whileTap scale: 0.8` causes the blur layer to clip incorrectly during the scale animation — appearing as a "broken/torn gradient strip."

**Fix:** 
- Move the static glow blob inside an `overflow-hidden` parent OR drop `filter: blur` (use `box-shadow` instead — composited cleanly on iOS).
- Set `transform: translateZ(0)` and `will-change: transform` on the blur layers so they get their own GPU layer instead of compositing oddly with the parent's scale.
- Reduce `scale: 1.5` open-animation overlay to `scale: 1.2` to stay inside button bounds.

### 4. Login flash even when already logged in
**Root cause in `src/App.tsx` (line 145) + `src/pages/Landing.tsx`:**
- `AppWithPreloader` shows the splash while `useAppPreloader` runs.
- BUT the splash hides as soon as `preloadStatus.isComplete = true` — which happens **before** `AuthProvider` finishes resolving the session.
- So for ~200-500ms after the splash hides, `Landing.tsx` renders (because `/` is the public route), THEN the `useEffect` at line 165 redirects to `/home` once `user` resolves. That's the "login flash."

**Fix:**
1. In `Landing.tsx`: gate the entire render behind `authReady`. If `!authReady`, return `null` (splash is still painting underneath OR show a tiny inline spinner). Once `authReady=true && user && profile?.onboarding_completed`, redirect immediately — never render the landing UI.
2. In `App.tsx` `AppWithPreloader`: keep splash visible until BOTH `preloadStatus.isComplete` AND `authReady` are true. Add an `authReady` selector via a small wrapper that consumes `useAuth()` (move `<SplashScreen>` inside `<AuthProvider>` or pass `authReady` via context bridge).
3. Persist a `localStorage` flag `vybe-was-logged-in` set on every successful auth — when present on boot, render splash longer (skip Landing entirely, route straight to `/home`).

### Files to change
1. `src/index.css` — global tap-highlight reset
2. `src/components/layout/BottomNav.tsx` — fix create button blur layers
3. `src/pages/Landing.tsx` — gate render behind `authReady`, skip render if logged-in user detected
4. `src/App.tsx` — extend splash visibility until `authReady`, add `vybe-was-logged-in` flag check

### Out of scope
- Email domain code changes (it's already set up — just needs UI selection via the Cloud panel)
- DM list styling (already done in earlier turn)
- The "create menu" content itself (only its tap-highlight)


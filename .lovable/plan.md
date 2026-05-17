## Goal
Whenever the app is loading content or a route inside the shell (slow internet, lazy chunk, data fetch), show a centered **breathing VYBE "V" logo** with a single line of rotating tips underneath — instead of bare spinners, blank screens, or "Loading…" text. The boot SplashScreen is untouched.

## New component
`src/components/ui/VybeLoader.tsx`

- Exports two things:
  - `<VybeLoader />` — flex-1 / `min-h-[40vh]`, centered, used inline.
  - `<VybePageLoader />` — fullscreen-ish wrapper (`min-h-screen flex items-center justify-center`) for route fallbacks.
- Both render the same internals:
  - The existing two-stroke VYBE "V" SVG (reused from `SplashScreen.tsx`, simplified — gradient strokes, glow filter).
  - **Breathing animation**: Framer Motion `animate={{ scale: [1, 1.12, 1], opacity: [0.85, 1, 0.85] }}`, `transition={{ duration: 2.2, ease: 'easeInOut', repeat: Infinity }}`. Soft radial glow behind it pulses on the same cadence.
  - Below the logo (after ~24px gap): a small uppercase muted "TIP" eyebrow + one rotating tip line.
  - Tips array (~15 entries, same on-brand list as planned for splash; lives inside the component file so any consumer gets them for free).
  - Tip index advances every 3.5s via `setInterval`. `AnimatePresence mode="wait"` cross-fades each tip (fade + 4px lift, 280ms).
  - Random starting tip index per mount.
  - Container `min-h-[3.5rem] w-[min(22rem,80vw)] text-center` so tip length changes don't reflow.
- **Delay guard**: an internal 350ms `setTimeout` before anything renders. If the parent unmounts the loader before 350ms (fast load), nothing ever flashes. Prevents the "blink" on quick navigations.

## Wiring

### `src/components/layout/AnimatedRoutes.tsx`
- Replace `PageFallback` body with `<VybePageLoader />`. This covers every lazy route Suspense.

### `src/components/ui/LoadingSpinner.tsx`
- Rewrite `PageLoader` (the exported full-page loader many pages already use) to render `<VybePageLoader />`. Keep the function signature (`message?` arg becomes a no-op so we don't break callers). This single change upgrades every consumer found in `Home`, `Watch`, `ChallengesHub`, `Search`, etc.
- Leave `LoadingSpinner`, `InlineLoader`, `ButtonLoader` untouched — they're used for tiny inline cases (buttons, list rows) where a breathing logo would be overkill.

### `src/components/auth/RootGate.tsx`
- Replace the three `<Suspense fallback={<div className="min-h-screen" />}>` fallbacks with `<VybePageLoader />` so post-auth route loads also get the breathing logo.

## Out of scope
- `SplashScreen.tsx` (boot) — left untouched per request.
- Skeleton loaders inside feeds (Home/Clips/etc.) — those are intentional placeholders for layout, not "loading the page". Swapping them would feel slower.
- Tiny inline spinners (`LoadingSpinner`, button spinners, list-row spinners) — kept as is.

## Result
On slow connections, any route change or page-level data load shows: VYBE V breathing softly in the center + a rotating tip every 3.5s. Fast loads (<350ms) show nothing — no flash. Boot splash stays exactly as it is today.
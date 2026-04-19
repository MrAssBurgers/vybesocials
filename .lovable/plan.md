
The user wants ALL linear/looping animations across the app (not just call overlay) to flow continuously without visible reset frames. Examples called out: login button, create menu button — these have shimmer/gradient/pulse loops that visibly snap back to frame 1.

### Root cause
Same pattern as before, but app-wide:
- `backgroundPosition: ['0% 50%', '100% 50%', '0% 50%']` — goes there and back, visible reverse
- `opacity: [0.5, 1, 0.5]` — pulse-back
- `scale: [1, 1.1, 1]` — breathe-back
- `x: [0, 20, 0]` — wander-back
- Some use `repeatType: 'reverse'` which guarantees a visible turnaround

Even with `ease: 'linear'`, any keyframe array that returns to the start creates a perceptible "reset" because direction reverses.

### Fix — convert to one-directional seamless loops

**1. Gradient/shimmer animations (login button, gradient buttons, CreateMenu)**
- Replace `backgroundPosition: ['0% 50%', '100% 50%', '0% 50%']` with one-way: `['0% 50%', '200% 50%']` on a 200%-wide gradient — end frame matches start visually.
- Or use CSS `background-size: 200% 100%` + animate `backgroundPosition: ['0% 0%', '-100% 0%']` for infinite scroll.

**2. Pulse/glow loops**
- Replace `opacity: [0.5, 1, 0.5]` with staggered fade-out waves: each layer goes `opacity: [0.6, 0]` + `scale: [1, 1.4]`, stacked with delays so a new wave starts as the old fades — constant flow, no reset.

**3. Floating/drift animations**
- Replace `x: [0, 30, 0]` with one-way translation on tiled/duplicated layers: `x: ['0%', '-50%']` on a doubled-width container — seamless wrap.

**4. Scale breathing**
- Where a "breathing" feel is wanted, keep it but add a second offset layer so the eye always sees outward motion from somewhere — no global reset moment.

### Scope — files to audit and update

Primary targets (called out by user + most visible):
- `src/components/hub/CreateMenu.tsx` — gradient icon backgrounds, header pulse, glow ring
- Login / auth buttons — find via search (likely `src/pages/Auth.tsx`, `src/components/auth/*`)
- `src/components/ui/button.tsx` `gradient-animated` class — defined in `tailwind.config.ts` / `index.css`
- `src/index.css` — `gradient-animated`, `liquid-glass-button`, any `@keyframes` with reverse paths
- `src/motion/liquidConfig.ts` — add a reusable `seamlessLoop` preset

Secondary sweep (any persistent loops):
- `src/components/call/GlobalCallOverlay.tsx` (already partially done — finalize)
- `src/components/call/MinimizedCallBubble.tsx`
- Background/ambient: `src/components/AppBackground.tsx` and similar
- Any `repeatType: 'reverse'` across `src/**` — replace with one-way keyframes

### Approach
1. Add `seamlessShimmer`, `seamlessDrift`, `seamlessWave` presets to `src/motion/liquidConfig.ts`.
2. Update `gradient-animated` CSS keyframes in `index.css` to use one-way `background-position` shift on a 200% gradient.
3. Sweep `src/**/*.tsx` for `repeatType: 'reverse'`, `[x, y, x]` triplet patterns, and `opacity: [a, b, a]` patterns in persistent loops — convert each.
4. Leave one-shot entrance animations (button tap scale, modal open) alone — those aren't loops.

### Expected result
- Login button gradient flows continuously in one direction, no visible "snap to start."
- CreateMenu icons/glow pulse outward in waves, never resetting.
- All app-wide ambient loops feel like constant flow.
- One-shot interactions (tap, hover, open) unchanged.

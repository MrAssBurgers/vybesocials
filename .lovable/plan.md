
The user wants the PiP corner-snap animation removed — when they release the dragged local video, it should stay exactly where they let go, not animate back to a corner. Same principle applied to any other call-overlay drag/animation that "snaps back."

### What's causing the snap-back
In `GlobalCallOverlay.tsx`, the recently added `onDragEnd` handler on the local video PiP calls `pipControls.start({ x: targetX, y: targetY, transition: { type: 'spring' } })`. That's the spring-back. Framer-motion's `drag` already keeps the element where you release it — the extra `animate` call is what yanks it to a corner.

### Fix
**1. Local video PiP — remove corner snapping entirely**
- Delete the `onDragEnd` snap handler.
- Remove `useAnimationControls` / `pipControls` usage on this element.
- Keep `drag`, `dragMomentum={false}`, `dragElastic={0}` (was 0.08 — set to 0 so edges don't bounce), and `dragConstraints={callContainerRef}` so it can travel freely to any pixel and stay there.
- Result: drag → release → it stays exactly where the finger lifts. No spring, no snap, no reset.

**2. Audit other call-overlay motion for snap-backs**
Quickly scan `GlobalCallOverlay.tsx` for any `whileDrag` + `animate`-on-release patterns or springy transitions that bounce. Specifically check:
- The minimized call bubble drag (if it snaps to an edge)
- The avatar/standby aura (must stay calm linear, no spring rebound)
- Any `transition: { type: 'spring' }` on drag-end handlers → replace with no animation OR a `linear` ease so motion is continuous, never elastic.

**3. Global motion principle for this overlay**
Where any continuous animation remains (e.g., the standby breathing pulse), confirm it uses `ease: 'linear'` with `repeat: Infinity` so it loops seamlessly without a visible reset frame. No `repeatType: 'reverse'` snap.

### Files to edit
- `src/components/call/GlobalCallOverlay.tsx` — remove PiP corner-snap, set `dragElastic={0}`, audit other drag handlers, ensure any looping animations use `linear` + seamless repeat.

### Expected result
- Drag your camera anywhere — top-left, dead-center, bottom-right pixel — release, it stays put. Zero snap-back.
- No rubber-band on edges.
- Any ambient looping animation in the call overlay flows continuously with no visible reset.

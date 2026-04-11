

## Fix Seamless Gradient Animations & Verify Camera Back Arrow

### Problem
The gradient animations "reset" visibly because the gradient pattern at `background-position: -100%` doesn't match `0%`. With a mirrored gradient (`A → B → C → B → A`) at `background-size: 200%`, shifting by `-100%` shows a different slice than `0%`, causing a visible "snap".

The fix: use `background-size: 300% 100%` with the gradient defined as `A → B → C → A` (ending where it starts). Then animate from `0%` to `-100%` which shifts exactly one "period" of the repeating pattern — seamless loop, no snap, continuous leftward motion.

### Camera Back Arrow
Already implemented — `StoryCreator` passes `showBackArrow` to `Camera`, which renders an ArrowLeft SVG. No changes needed here.

### Changes

**1. `src/index.css`** — Fix `gradient-shift` and `premium-gold-shimmer` keyframes + gradient definitions

- **`.gradient-animated`**: Change gradient to `A → B → C → A` (4 stops, last = first) with `background-size: 300% 100%`. Keyframe shifts from `0% 50%` to `-100% 50%` (one full period).
- **`.create-button-gradient`**: Same pattern — 4 stops ending on first color, `300% 100%`, shift `-100%`.
- **`@keyframes gradient-shift`**: `0% { background-position: 0% 50% }` → `100% { background-position: -100% 50% }`
- **`@keyframes premium-gold-shimmer`**: Same approach with `300%` size and `-100%` shift.

**2. `src/components/ui/StyledUsername.tsx`** — Update inline shimmer styles
- Change `backgroundSize` from `200% 100%` to `300% 100%` to match the new keyframe math.

### Files to modify
- `src/index.css`
- `src/components/ui/StyledUsername.tsx`


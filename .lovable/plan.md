

## Fix: Replace Falling Confetti with Radial Burst Sprinkles on Welcome Back Dismiss

**What changes**: When the welcome back splash dismisses, instead of confetti raining down from the top of the screen, small colorful particles will burst outward radially from the center (where the avatar is) — like the icon imploded and sprinkles shot out in all directions. Quick, clean, satisfying.

### Changes to `src/components/ui/WelcomeBackSplash.tsx`

1. **Remove the `<Confetti />` import and usage** — no more falling confetti from top
2. **Add inline radial burst particles** — 20-30 small dots that explode outward from center on exit:
   - Particles spawn at the avatar's position (center of screen)
   - Each travels outward in a random direction (360° spread) with random distance (80-200px)
   - Quick duration (~0.8s) with easeOut — feels snappy
   - Particles fade out as they travel, scale down slightly
   - Colors use the existing primary/accent palette
3. **Trigger timing**: The burst fires at the same moment `visible` goes false (when the splash starts its exit animation), so it feels like the splash "popped" into sprinkles
4. **The exit animation on the main container stays** (scale 1.08 + blur) — the burst particles layer on top of that for a combined "implode + scatter" effect

**Single file modified**: `src/components/ui/WelcomeBackSplash.tsx`

No other files affected. No database changes.


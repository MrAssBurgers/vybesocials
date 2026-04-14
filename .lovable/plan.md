

## Revamp Linear Animations — Seamless, Flowing Motion

### Problem
The current `linear` timing animations feel mechanical and robotic. Gradient shifts, shimmers, spins, and decorative loops use raw `linear` easing which creates a flat, lifeless cadence. Many also "snap" at the loop reset because the background-size and keyframe offsets aren't tile-safe.

### Philosophy
Every perpetual animation should feel like watching water flow — no visible start, no visible end, no jarring resets. The key principles:
- **Ease, never linear**: Replace `linear` with custom cubic-beziers that have a gentle acceleration/deceleration even on infinite loops — `cubic-bezier(0.4, 0, 0.6, 1)` (symmetric ease) for loops
- **Tile-safe backgrounds**: Use 300% background-size with a repeating color pattern (A→B→C→A) and shift exactly -33.333%, so the end frame = start frame
- **Slower durations**: Extend most loop durations to 5–8s for a languid, premium feel
- **GPU-accelerated only**: Every looping animation uses `will-change: transform` or `will-change: background-position` and `transform: translateZ(0)`

### Changes

**1. `src/index.css` — Rewrite all looping keyframes and their classes**

Core animations getting the seamless treatment:

| Animation | Current | New |
|-----------|---------|-----|
| `gradient-shift` | 200% size, -100% shift, `linear` | 300% size, -33.333% shift, `ease-in-out` 6s |
| `shimmer` | translateX -100% → 100%, `linear` | -100% → 200% with ease, 2.2s |
| `splash-shimmer` | translateX -100% → 200%, `linear` 1.8s | Keep distance, add ease, 2.4s |
| `shimmer-sweep` | translateX -150% → 150%, `linear` | -100% → 200%, ease 4.5s |
| `friendlink-shimmer-sweep` | 200% bg, -100% shift, `linear` 4s | 300% bg, -33.333% shift, ease 5s |
| `cyber-ring-spin` | rotate 360°, `linear` 4s | Keep linear (rotation must be linear), but slow to 6s |
| `cyber-scanline` | top -2px → 100%+2px, `linear` 3s | ease-in-out 4s for smooth turnaround feel |
| `cyber-stream-fall` | translateY, `linear` 2s | ease-in 2.8s (accelerating fall) |
| `cyber-particle-rise` | translateY, `linear` 1.5s | ease-out 2.2s (decelerating rise — more natural) |
| `rainbow-text` | color cycle, `linear` 3s | ease-in-out 5s for smoother hue transitions |
| `orbit-sparkle` | rotate orbit, `linear` 3s | Keep linear, slow to 5s |
| `spin-smooth` | rotate, `linear` 2.5s | Keep linear, slow to 4s |

For gradient animations specifically, convert all background patterns to tile-safe:
```text
Before: background-size: 200% 100%
        from { background-position: 0% 50% }
        to   { background-position: -100% 50% }

After:  background-size: 300% 100%
        background: linear-gradient(90deg, A, B, C, A)  ← repeat first color
        from { background-position: 0% 50% }
        to   { background-position: -33.333% 50% }
```

**2. `tailwind.config.ts` — Update Tailwind animation definitions**

- `gradient-shift` keyframe: change from ping-pong (0%→50%→100% back) to one-directional seamless loop
- All entrance animations keep their current snappy cubic-bezier — only perpetual/decorative loops get smoothed

**3. `src/components/ui/StyledUsername.tsx` & `src/components/ui/VYBELogo.tsx`**

- Update inline `animation` styles to use new durations (6s instead of 3.2s)
- Add `will-change: background-position` for GPU acceleration

**4. `src/components/layout/BottomNav.tsx`**

- Update `shimmer-sweep` reference to use new timing

**5. `src/motion/liquidConfig.ts` & `src/lib/motion.ts`**

- No changes needed — these are spring-based (already smooth)

### What stays the same
- All spring-based framer-motion animations (already liquid)
- All entrance/exit animations (one-shot, not loops)
- Rotation animations stay `linear` (physically correct for rotation)
- Fire, wiggle, pulse animations stay `ease-in-out` (already correct)

### Files modified
- `src/index.css` — ~15 keyframe rewrites + class updates
- `tailwind.config.ts` — gradient-shift keyframe fix
- `src/components/ui/StyledUsername.tsx` — duration + will-change
- `src/components/ui/VYBELogo.tsx` — duration + will-change
- `src/components/layout/BottomNav.tsx` — timing update


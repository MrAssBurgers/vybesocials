

## Fix Toast Redesign + Explore Top Gap

### Issues

1. **System notification toasts are ugly and can't be swiped away** — The current sonner toasts use a pill shape with green check icons, left accent bars, and only support horizontal swipe (Sonner default is `swipeDirection: "right"`). They stack up and feel immovable. Need a complete visual redesign and swipe-up-to-dismiss.

2. **Explore bar has a gap at the top** — The clips fullscreen viewer tab bar at line 320 uses `pt-[max(env(safe-area-inset-top),8px)]` which creates a visible gap. On the videos view (line 404), the `py-4` adds unnecessary top spacing too.

### Plan

**1. Redesign Sonner toast styles (`src/components/ui/sonner.tsx` + `src/index.css`)**

- Add `swipeDirection="up"` to the Sonner `<Toaster>` component so users can swipe up to dismiss
- Completely redesign the `.toast-pill` CSS in `index.css`:
  - Remove the left accent bar (`::before` pseudo-element)
  - Use a cleaner, minimal card style: subtle border, tight padding, no colored title text
  - Smaller icon, muted colors, no heavy shadows
  - Clean entrance/exit: slide down from top, swipe up to dismiss
  - Single-line compact layout with icon + text + subtle close button
  - Remove the `scale(0.97)` active press effect (feels cheap)
  - Cleaner variant colors: subtle tinted background instead of colored accent bars

**2. Fix Explore top gap (`src/pages/Explore.tsx`)**

- Line 320: Change `pt-[max(env(safe-area-inset-top),8px)]` to `pt-[env(safe-area-inset-top)]` — no minimum padding, flush to the safe area
- Line 404 (Videos gallery): Reduce `py-4` to `pt-0 pb-4` so the tab bar sits flush at top

### Files to change
- `src/components/ui/sonner.tsx` — add `swipeDirection="up"`
- `src/index.css` — redesign all `.toast-pill*` styles (lines 2885-3066)
- `src/pages/Explore.tsx` — remove top gap on both clips and videos views


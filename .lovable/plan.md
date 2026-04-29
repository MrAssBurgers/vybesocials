## Restore the floating bottom nav

Right now the mobile bottom nav is glued edge-to-edge with only the top corners rounded, which makes it read as a chopped-off bar. Switch it back to the old floating pill that sits above the bottom edge with breathing room on all sides and full corner radius.

### Visual changes (`src/components/layout/BottomNav.tsx`)

- Outer `<motion.nav>` wrapper:
  - Stop stretching the bar full width. Replace `left-0 right-0 w-full` with a centered container that has horizontal margin so the pill floats: `left-1/2 -translate-x-1/2 w-[min(420px,calc(100%-1.25rem))]`.
  - Lift it off the bottom edge: add `bottom: calc(env(safe-area-inset-bottom, 0px) + 10px)` (replacing the current `bottom-0` + bottom safe-area padding pattern). Keep left/right safe-area padding off — the centered width handles edge insets.
- Inner pill container:
  - Change `rounded-t-[28px]` to a fully rounded `rounded-[28px]` so all four corners are curved.
  - Replace the upward shadow (`0 -8px 24px ...`) with a soft drop shadow on all sides: `0 10px 30px hsl(var(--background) / 0.55), 0 2px 10px hsl(0 0% 0% / 0.35), inset 0 1px 0 hsl(0 0% 100% / 0.06)`.
  - Swap the top-only border (`border-t border-white/5`) for a full hairline (`border border-white/5`).
  - Keep the existing solid `bg-card` (per the project's perf rule against backdrop blur on the bottom nav) and the aurora/hairline overlays — they already round-clip via `overflow-hidden`.
- Hide-on-scroll animation: bump the offscreen translate from `y: 120` to `y: 140` so the floating bar (which now has bottom spacing) clears the screen cleanly when hidden.

### Layout padding (`src/components/layout/AppLayout.tsx`)

The mobile main container reserves `5rem + safe-area-inset-bottom` of bottom padding for the nav. Bump that to `6rem + safe-area-inset-bottom` so content doesn't tuck under the now-floating pill (it sits ~10px higher than before and casts a shadow).

### What stays the same

- 5-column grid, icon sizes, badges, drag-to-reorder, edit-mode aura, create button, scroll-hide behavior, keyboard-open auto-hide.
- Desktop layout (this nav only renders on mobile/tablet via existing logic).
- Z-index 5002 and aurora gradient wash.

### Result

The bar floats above the bottom edge with rounded corners on every side, a soft ambient shadow, and a small gap from the screen edges — matching the old "floating navigator" look that worked everywhere without looking cut off.

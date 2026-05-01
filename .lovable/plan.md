# Fix: Sidebar text blending into pink theme background

## What's happening

In your screenshot, sidebar items ("Explore", "DM's", "VybeMap", "Communities", "Market", "Events", and the Audio/Quests/Records/Settings quick-action grid) are rendered in `text-muted-foreground` (light gray). On your dark theme this normally has good contrast — but you've applied a custom **pink/peach background image** to the page. The pink shows through the glass sidebar via `backdrop-filter: blur`, so visually the text sits on a light surface, but the contrast guard reads the underlying body color (still dark) and decides nothing needs fixing.

So this isn't a missing feature — the guard exists (`useContrastAutoGuard` in `src/hooks/useContrastAutoGuard.ts`) but it's blind to:

1. Background **images** and **gradients** (it only reads `background-color`).
2. Backgrounds painted by `::before` / `::after` pseudo-elements (your themed body uses one).
3. `position: fixed` background layers behind the body.
4. Heavily-blurred glass surfaces — currently boosts alpha by only +0.25, not enough when the underlying surface is essentially fully visible through the blur.

## The plan

### 1. Upgrade the contrast guard (`src/lib/contrastGuard.ts` + `src/hooks/useContrastAutoGuard.ts`)

Make `getEffectiveBg` actually see what the user sees:

- **Sample background images / gradients.** When a layer has a `background-image` (gradient or image) and not a solid color, take a representative sample of its dominant color. For gradients, parse the CSS string and average the listed color stops. For raster images, fall back to a mid-luminance neutral so we don't crash on remote images.
- **Read pseudo-element backdrops.** When walking up the ancestor chain, also call `getComputedStyle(node, '::before')` and `::after`. If they paint a full-bleed background (covers the element via `inset:0` / `position:absolute` with non-zero size), composite that color too.
- **Treat strong blur as "background-dominated."** When `backdrop-filter` contains `blur(>= 12px)` on a low-alpha surface, weight the underlying background heavily (e.g., 70% underlying + 30% surface tint) instead of the current flat +0.25 alpha bump. This matches how the eye actually sees a frosted panel.
- **Honor full-bleed fixed layers.** Before falling back to body color, look for `position: fixed` elements with `inset: 0` (theme background layers) and use their effective color first.

These changes are pure logic in `contrastGuard.ts`; the existing scanner in `useContrastAutoGuard.ts` will automatically pick up better readings on its next pass.

### 2. Re-scan after route / sheet transitions

The mobile sidebar opens via a Radix Sheet (animated portal). During the open animation the guard pauses (`is-scrolling`-style throttle) and may miss the final state. Add:

- A `themechange`-style custom event already exists; also re-trigger a scan on `transitionend` / `animationend` for elements with `[data-radix-portal]`, `[data-state="open"]`, or `role="dialog"` ancestors.
- Reduce the post-mutation debounce from 150ms → 80ms specifically for newly-mounted portal subtrees so the first frame the user sees is already corrected.

### 3. Harden sidebar text so it can't blend even before the guard kicks in

Even with a perfect guard there's a flash before correction. So in the sidebar components, swap `text-muted-foreground` (which is theme-relative gray) for the **adaptive token** the guard uses, or wrap the labels with a class that picks readable foreground from the *visible* surface:

- `src/components/layout/Sidebar.tsx` (desktop)
- `src/components/layout/DesktopLeftSidebar.tsx`
- `src/components/layout/MobileHeader.tsx` (the drawer in your screenshot)

Replace the inactive-state classes:

```text
text-muted-foreground  →  text-foreground/85   (always readable on glass)
hover:text-sidebar-foreground (kept)
```

And add `data-auto-contrast` to the `<span>` labels so the guard prioritizes them.

For the small "Alerts / Quests / Records / Settings" grid (which also vanishes in your screenshot), give that pill bar a more opaque surface (`bg-card/70` instead of `bg-muted/30`) so it stops being see-through.

### 4. Add a one-line developer escape hatch

Document in `src/lib/contrastGuard.ts`:

- `data-no-auto-contrast` on any ancestor still disables the guard (already supported).
- New: `data-force-contrast="dark|light"` to manually pin a region's foreground choice (useful for branded gradients where neither readable shade looks great and you want to lock one).

## Files touched

- `src/lib/contrastGuard.ts` — gradient/pseudo-element/blur logic
- `src/hooks/useContrastAutoGuard.ts` — portal/animation re-scan trigger
- `src/components/layout/Sidebar.tsx`
- `src/components/layout/DesktopLeftSidebar.tsx`
- `src/components/layout/MobileHeader.tsx`
- `src/index.css` — minor: ensure `[data-contrast-fixed]` rule has `transition: color .15s` so the correction doesn't pop

## Out of scope

- No backend / DB changes.
- Not touching theme tokens themselves — your custom theme stays exactly as designed.
- Not auto-changing icon colors yet (icons inherit `currentColor` so they'll follow the text fix automatically).

## How you'll verify

After approval and implementation, open the sidebar over your pink theme — every label should immediately be legible (dark text on the pink-tinted glass), and switching back to a dark wallpaper should snap them back to light text within ~150ms.

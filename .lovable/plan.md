# Fix: Sidebar text going dark-on-dark (and "fixing itself" only when scrolling)

## What's actually happening

In your screen recording, every sidebar label ("Explore", "DM's", "VybeMap", "Communities", "Market", "Events", "Alerts/Quests/Referrals/Settings", and even the right-rail "ONLINE (0)" / "TRENDING") flips to dark text on the **dark** sidebar — invisible. When you scroll, the contrast-fix pass is paused, so the original light text briefly reappears, which is why it looks glitchy / "stops on scroll".

The cause is the upgrade I shipped last round to `src/lib/contrastGuard.ts`. The new "see what the user sees" logic is too aggressive on a themed page:

1. **Wallpaper leaks through opaque ancestors.** When a small blurred chip (e.g. a pill, badge, glass surface) is found, the new `blurAmount >= 12` short-circuit jumps straight to the page's pink wallpaper, **skipping the opaque dark sidebar that sits between them**. So the guard thinks the chip is on pink and forces dark text — but it's actually on dark.
2. **Gradient layers are inflated to ~0.9 alpha.** Lots of UI overlays use 5–15% gradient tints. The guard now treats them as nearly opaque, so the composited "background" ends up being the gradient color instead of the real surface underneath.
3. **Pseudo-element bgs are pinned to ~0.95 alpha.** Same problem — a `::before` glow halo gets read as a solid wash of pink/purple, hiding the actual card color below.
4. **Body fallback returns the themed gradient.** Your body has the pink theme gradient applied, so any text whose ancestor walk doesn't terminate at an opaque card falls all the way through to "page is pink" — even when the sidebar is rendered with `bg-card` (opaque dark).

Net result: most of the chrome goes dark-on-dark on themed accounts.

## The fix

Targeted, surgical rollback of the parts that overreach. Keep the parts that were genuinely useful (gradient sampling on truly transparent ancestors, manual `data-force-contrast` override).

### 1. `src/lib/contrastGuard.ts` — make ancestor walk respect opaque surfaces

- **Stop walking the moment we hit an opaque ancestor.** Inside the `while` loop, after compositing this node's solid `background-color`, if `bgColor.a >= 0.85` treat it as fully opaque and `return` immediately. This is the single biggest fix — the dark sidebar will correctly terminate the walk before we ever consult pseudo-elements, blur boosts, or wallpaper layers.
- **Remove the `blurAmount >= 12` wallpaper short-circuit.** Heavy blur inside an opaque card must still resolve against the card, not the page. If we want to keep any blur awareness it should be a small alpha bump on the *current* layer only (≤0.1), never a jump to wallpaper.
- **Drastically downweight pseudo-element and gradient layers.** They are tints, not surfaces:
  - `getPseudoBg` should return the gradient with its **actual** averaged alpha (don't bump to 0.95). Cap at 0.6.
  - The gradient branch inside `getEffectiveBg` (step 2) should composite at the gradient's natural alpha, capped at 0.5, not boosted to ≥0.9.
- **Don't fall back to the wallpaper unless we genuinely never hit anything opaque.** Today every text node ends up sampling the wallpaper because the body itself is themed. Solution: only call `getFullBleedFixedBg()` when `result.a < 0.2` after the walk (meaning the entire ancestor chain was transparent), AND skip it if the body computed background-color is itself near-opaque.
- **Body fallback uses `background-color` only**, not the gradient image. The gradient is a wallpaper effect; for contrast purposes, treat the body as its solid base color so cards/sidebars-with-no-bg fall back to a sensible neutral, not pink.

### 2. `src/hooks/useContrastAutoGuard.ts` — softer hysteresis and ignore self-painted overrides

- **Increase the release hysteresis from `+1.5` to `+2.5`.** When our applied color now passes "cleanly", we release. Bigger margin prevents the flicker loop on themed pages where the sampled bg jiggles between scans.
- **Skip elements whose computed `color` is already near-white on a dark surface or near-black on a light surface** (cheap pre-check before sampling) — saves work and avoids touching elements that are clearly fine.
- **Stop re-scanning on every `transitionend` / `animationend`.** That listener fires constantly on this app (hover transitions, pulses, marquee) and re-runs the (now-faulty) scan over the same nodes. Keep only `animationend` filtered to `data-state="open"` portals (drawers/sheets), not transitions.

### 3. Sidebar text — drop the `data-auto-contrast` opt-in

Last round we added `data-auto-contrast` markers to sidebar labels to *force* the guard to evaluate them. That's now actively harmful while the guard is misreading the bg. Remove those markers from:

- `src/components/layout/Sidebar.tsx`
- `src/components/layout/DesktopLeftSidebar.tsx`
- `src/components/layout/MobileHeader.tsx`

Keep the readability change to `text-foreground/85` (it's good baseline contrast on glass) but wrap the sidebar `<aside>` / drawer `<nav>` with `data-no-auto-contrast` so the guard never touches sidebar chrome again. The sidebar's own theme tokens already guarantee contrast — we don't need runtime correction there.

### 4. CSS — keep the soft transition but scope the override

In `src/index.css`, ensure `[data-contrast-fixed]` only sets `color: var(--auto-contrast-color)` when `--auto-contrast-color` is actually defined (use `@supports` or a fallback) so a stale attribute can't strand an element on the wrong color after we release it.

## Files touched

- `src/lib/contrastGuard.ts` — opaque-stop, remove blur-wallpaper jump, downweight pseudo + gradient, restrict wallpaper fallback
- `src/hooks/useContrastAutoGuard.ts` — bigger release hysteresis, drop transitionend, narrow animationend filter
- `src/components/layout/Sidebar.tsx` — remove `data-auto-contrast`, add `data-no-auto-contrast` on root
- `src/components/layout/DesktopLeftSidebar.tsx` — same
- `src/components/layout/MobileHeader.tsx` — same on the drawer root
- `src/index.css` — defensive `[data-contrast-fixed]` rule

## How you'll verify

1. With the pink theme active, every sidebar label is legible immediately on page load — no flash of dark-on-dark, no change while scrolling.
2. The right rail ("ONLINE", "TRENDING", chat list) stays white text.
3. Switch back to the default dark wallpaper and the same labels stay light — no over-correction.
4. Open a Sheet (mobile drawer) — labels inside are readable from frame 1, not after a re-scan.

## Out of scope

- No DB / backend changes.
- Not touching theme tokens.
- The custom theme wallpaper rendering itself is unchanged — only how we measure it for contrast decisions.

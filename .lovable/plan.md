

## Goal
Eliminate the yellow tint that appears on resize and ensure the app fits every viewport size cleanly with no colored letterboxing or stray overlays.

## Likely culprits (will fix all)

1. **AdSense script auto-injecting placeholder frames.** `index.html` loads `adsbygoogle.js` site-wide, but no `<ins class="adsbygoogle">` slots exist in the app yet. On certain hosts/viewport changes, the script can render yellow/amber "verification" or fallback placeholders. Per the existing comment, ads are gated behind `useShowAds.ts` and disabled until approval — so the script should NOT be loading globally yet.

2. **`OfflineBanner` (`src/components/ui/EmptyState.tsx`)** uses a full-width `bg-yellow-500/90` bar. It isn't currently mounted anywhere, but it's a footgun and should be re-skinned to match the app's dark/glass aesthetic.

3. **`html, body` background mismatch on resize.** `index.html` inline CSS sets `#0B0B10`, but when the viewport resizes there can be a moment where the React `AppBackground` layer hasn't repainted, exposing whatever the browser/extension/ad iframe paints behind. Also no `html { background }` rule — some browsers fall back to white/yellow accent.

4. **Viewport meta has `maximum-scale=5, user-scalable=yes`.** Combined with `viewport-fit=cover`, iOS Safari can show a yellow accent strip in the safe-area when the user pinch-zooms or rotates. Lock to no-zoom for the app shell.

5. **Missing `color-scheme` lock on `html`.** Browsers sometimes paint scrollbars/letterboxing using the OS accent (yellow on some Android themes). Force dark.

## Fix plan

### A. Remove the AdSense auto-load until ads ship
`index.html` — remove the `<script async src="…adsbygoogle.js…">` tag from `<head>`. If/when ads are approved, load it lazily from `useShowAds.ts` only on pages that render an ad slot. This kills the most likely source of an injected yellow placeholder.

### B. Re-skin `OfflineBanner`
`src/components/ui/EmptyState.tsx` — replace `bg-yellow-500/90 text-yellow-900` with a glass card (`bg-card/90 backdrop-blur-xl border border-border/50 text-foreground`) and a small `WifiOff` icon. Matches the rest of the app and removes the yellow even if it ever mounts.

### C. Lock global paint to brand dark
`index.html` inline `<style>`:
- Add `html { background: #0B0B10; color-scheme: dark; }`.
- Add `:root { background: #0B0B10; }`.
- Add `#root { background: #0B0B10; }` (already there — keep).
- Ensure `body::before, body::after { content: none; }` defensively to prevent injected pseudo overlays.

### D. Fit-every-size hardening
`index.html` viewport meta — change to:
`width=device-width, initial-scale=1.0, viewport-fit=cover, maximum-scale=1, user-scalable=no`
This stops pinch-zoom from exposing yellow safe-area accents on iOS.

`src/index.css` — add a single global rule:
```css
html, body, #root {
  min-height: 100dvh;
  background: hsl(var(--background));
}
```
Ensures the dvh-based shell tracks the viewport on resize/keyboard with no colored gaps.

### E. Sweep for any other stray yellow overlay
Audit and confirm none of these render full-screen on resize:
- `src/components/error/GlobalErrorHandler.tsx` (offline toast — already a toast, fine).
- `Toybox.tsx` sticker chip (`bg-yellow-500/10` — local chip, fine).
- `Camera.tsx` flash (`bg-yellow-400/30` — only inside camera UI, fine).

No code changes needed for those — confirmed they're component-local.

## Files to edit
- `index.html` — remove AdSense, tighten viewport, add dark `html`/`color-scheme`.
- `src/components/ui/EmptyState.tsx` — re-skin `OfflineBanner` to glass.
- `src/index.css` — add global `html/body/#root` background + min-height rule.

## Expected result
- No yellow tint at any viewport size, on resize, on rotate, on keyboard open, or on pinch.
- App background stays consistent `#0B0B10` / themed background through every reflow.
- Zero AdSense placeholder frames until ads are formally enabled.
- All overlays (offline, errors) match the dark/glass aesthetic.


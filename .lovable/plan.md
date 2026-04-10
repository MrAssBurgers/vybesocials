

## Replace Background Overlay with Native CSS Background

### Current Problem
The custom background is rendered as a separate `<div>` overlay at z-index 0, with all app content layered above it at z-index 1+. This means:
- The image loads as a React component, so on slow connections the user sees the default background first, then the overlay fades in — a visible "pop"
- An extra full-viewport DOM element with `position: fixed` adds a compositing layer the GPU has to manage constantly
- CSS rules force `body` and `#root` to `transparent !important` to let the overlay show through, which is fragile

### Better Approach
Set the background image directly on `document.body` via inline style. No overlay div, no z-index layering, no transparency hacks. The browser's native `background-image` on `<body>` is the most efficient way to paint a full-page background — zero extra compositing layers.

### Changes

**1. `src/components/layout/AppBackground.tsx`**
- Remove the `BackgroundLayer` div entirely
- In the provider, apply the background via `document.body.style` instead of rendering a child div:
  - `document.body.style.backgroundImage = url(...)`
  - `document.body.style.backgroundSize = 'cover'`
  - `document.body.style.backgroundPosition = 'center'`
  - `document.body.style.backgroundRepeat = 'no-repeat'`
  - `document.body.style.backgroundAttachment = 'fixed'`
  - Apply opacity via a CSS variable (`--bg-opacity`) and use a pseudo-element or filter only if opacity < 1
  - Apply blur the same way
- On cleanup / logout / null image, clear the body styles
- Keep the context API identical so all consumers (`setBackgroundImage`, `setBackgroundOpacity`, etc.) still work

**2. `src/index.css`**
- Remove the `:has(#app-background-layer)` and `data-has-bg-image` transparency hacks (lines ~524-539)
- Remove the `#root { z-index: 1 }` workaround (line ~542-544) — no overlay to layer above
- Add a simple rule: when `--bg-image` is set on body, ensure `#root` has `background: transparent` so the body background shows through

**3. Minor: body default background**
- Ensure `body` has a sensible default dark background color so there's no flash — the custom image simply replaces it when loaded, same element, no layering

### Why This Is Better
- **Faster perceived load**: The browser starts fetching `background-image` on body immediately; no React render cycle needed first
- **Less lag**: Eliminates one GPU compositing layer (the fixed overlay div)
- **Simpler CSS**: No transparency hacks, no z-index management
- **Same API**: All existing code that calls `setBackgroundImage()` / `setBackgroundOpacity()` keeps working

### Files Touched
| File | Change |
|------|--------|
| `src/components/layout/AppBackground.tsx` | Replace overlay div with `document.body.style` manipulation |
| `src/index.css` | Remove overlay-related CSS hacks |


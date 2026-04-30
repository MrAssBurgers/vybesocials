## Bug: Frosted Glass Header Goes See-Through During Scroll

The fixed `MobileHeader` (and any other liquid-glass surface) uses `backdrop-filter: blur(...)` for its frosted look. There's already a perf optimization in `src/index.css` that strips `backdrop-filter` while the page is scrolling (because backdrop-filter is the #1 cause of scroll jitter on Safari/Chromium):

```css
html.is-scrolling .liquid-glass, ... {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
```

But it never replaces the lost background — so the header momentarily becomes transparent and post content visibly slides through it. That's the "glitch" in the recording.

## Fix

In `src/index.css` (the existing `html.is-scrolling` rule near line 977), add a solid `background-color: hsl(var(--card))` fallback so the surface stays opaque while blur is suspended. Aligns with the project Core rule: "Use solid 'bg-card' for high-frequency UI instead of backdrop-blur."

```css
html.is-scrolling [class*="backdrop-blur"],
html.is-scrolling .liquid-glass,
html.is-scrolling .liquid-glass-card,
html.is-scrolling .liquid-glass-button,
html.is-scrolling .liquid-glass-subtle,
html.is-scrolling .liquid-glass-depth,
html.is-scrolling .glass-card {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background-color: hsl(var(--card)) !important;  /* NEW */
  transition: none !important;
}
```

Single CSS change. No component edits needed — this fixes the header, bottom nav, and every other liquid-glass surface at once. When scrolling stops, the rule is removed, blur returns, and the original translucent look comes back.
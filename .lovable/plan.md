I found the cause: the previous scroll fix makes every glass/backdrop surface switch to solid `bg-card` while scrolling. On this dark theme, that prevents transparency but also makes the login/signup card and other frosted areas look noticeably darker during scroll.

Plan:

1. Update the global scroll optimization in `src/index.css`
   - Keep disabling `backdrop-filter` while scrolling for performance.
   - Replace the current dark `background-color: hsl(var(--card)) !important` fallback with lighter, material-specific fallbacks that preserve the normal frosted look:
     - `.liquid-glass`: use the same glass gradient without blur.
     - `.liquid-glass-card`: use the same card gradient without blur.
     - `.liquid-glass-subtle`, `.liquid-glass-depth`, `.glass-card`, and Tailwind `backdrop-blur-*` elements: use semi-opaque backgrounds instead of a fully solid dark card.

2. Avoid globally darkening all `backdrop-blur` elements
   - The selector `html.is-scrolling [class*="backdrop-blur"]` is too broad and catches buttons, overlays, login elements, and small UI badges.
   - I’ll narrow it so scroll optimization still protects expensive glass surfaces but doesn’t force unrelated UI to become dark.

3. Preserve the original bug fix
   - Headers/nav/cards still won’t turn transparent while scrolling.
   - The app should now scroll normally without the visible dark flash/dim effect.

Technical details:

```css
html.is-scrolling .liquid-glass {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background: linear-gradient(...same glass values...) !important;
}

html.is-scrolling .liquid-glass-card {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
  background: linear-gradient(...same card values...) !important;
}
```

This is a focused CSS-only fix in `src/index.css`.
# Vybe brand assets

## Logo (`vybe-logo.svg`)

**Single source of truth** for the V mark geometry.

1. Redraw in Figma: 2 capsule shapes → Boolean Union → corner smoothing.
2. Add four gradients, three blur layers, bloom, highlights (match reference).
3. Export SVG → paste `d` values into the layer ids in `vybe-logo.svg`.
4. Copy the same file to `public/branding/vybe-logo.svg` for boot splash.

Application code (`VybeLogo.tsx`) only themes colors and animates glow — **never regenerates geometry**.

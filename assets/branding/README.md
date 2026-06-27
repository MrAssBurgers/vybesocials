# Vybe Logo System

`assets/branding/vybe-logo.svg` is the **source of truth** for the Vybe V mark.

## Rules

1. Do not rebuild the logo with CSS divs or procedural React paths.
2. Do not redraw geometry inside components — edit the SVG asset only.
3. Use `src/components/brand/VybeLogo.tsx` for all app UI.
4. Copy the same file to `public/branding/vybe-logo.svg` for splash/loading/static use.
5. Theme only these CSS variables:
   - `--vybe-logo-primary`
   - `--vybe-logo-secondary`
   - `--vybe-logo-accent`
   - `--vybe-logo-glow`

## Test sizes

24 · 32 · 48 · 96 · 180 · 512 px — should stay curvy, glossy, and glowing at every size.

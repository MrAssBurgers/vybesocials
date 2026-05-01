# Redesign: Design Your Own VYBE — "Holographic Forge"

Transform `AIVybeDesigner.tsx` from a standard 4-step form into a futuristic, sci-fi "VYBE Forge" experience that feels like calibrating a personal hologram.

## Visual Direction

**Concept:** A glassy holographic console floating in deep space. Neon orbital rings, scanning grid backdrop, drifting particles, chromatic aberration glow, and a live morphing "VYBE Orb" at the center that reacts to every choice in real time.

**Palette:** Driven by current `--primary` / `--accent` tokens so it adapts to whatever theme is active.

## Step-by-Step Changes

### 1. Background (replaces single conic gradient)
- Animated **starfield/grid layer** (CSS perspective grid that scrolls toward viewer — pure CSS, no JS).
- Two slow counter-rotating conic gradients with chromatic offset.
- Floating particle dots (8-12 small `motion.div`s with randomized drift, GPU-only transforms).
- Subtle vignette + film grain overlay (SVG turbulence, `opacity-[0.03]`).
- All layers respect `prefers-reduced-motion`.

### 2. The VYBE Orb (new centerpiece)
A persistent ~140px hovering sphere at the top of every step:
- Layered radial gradients using `--primary` and `--accent`.
- Inner pulsing core + 2 orbital rings rotating opposite directions.
- Hue/intensity morphs as user picks vibe (mapped from `vibe.gradient`).
- On generate: orb expands, ring spins faster, then settles with the new theme color.

### 3. Step 1 — VIBE selection (most dramatic upgrade)
- Replace 2-column rectangular cards with a **radial/honeycomb arrangement** of 8 vibe orbs around the central VYBE Orb (or a fanned arc on small viewports — fall back to 2-col grid below 360px).
- Each vibe = circular gradient chip with glow, icon centered, label underneath.
- Selected: orbital ring traces around it + connecting beam to the center orb.
- Custom prompt textarea restyled as a **"// neural input"** terminal field with a blinking caret and monospace placeholder.

### 4. Step 2 — STYLE
- Header label as `[ 02 / CALIBRATION ]` chrome chip.
- Typography & Motion sections wrapped in glass panels with corner brackets (┌ ┐ └ ┘ via pseudo-elements).
- Section icons get neon glow rings.

### 5. Step 3 — BUILDING
- Keep `VybeGenerationAnimation` but overlay a **HUD frame**: scanning line sweeping top→bottom, phase counter `[ 03 / 05 ]`, and the orb at full intensity with rapid ring rotation.

### 6. Step 4 — PREVIEW
- "Reveal" sequence: orb cracks open with a flash, preview cards slide in with staggered tilt.
- Cards get glass + neon edge treatment matching theme color.
- Buttons: "Try Again" → `[ RECALIBRATE ]`, "Keep It" → `[ DEPLOY VYBE ]` (still readable, not gimmicky).

### 7. Progress Bar (top)
Replace flat bars with **segmented chevrons** (`◢◣`) that fill with neon gradient and pulse when active. Shows step number + label: `01 VIBE → 02 STYLE → 03 PREVIEW`.

## Technical Section

**Files modified:**
- `src/components/onboarding/AIVybeDesigner.tsx` — full JSX/styling overhaul, logic untouched (snapshot, generate, save flow stays identical).
- `src/index.css` — add new keyframes & utility classes scoped under `.vybe-forge-*`:
  - `@keyframes forge-grid-scroll`, `forge-orb-pulse`, `forge-ring-spin`, `forge-scan-line`, `forge-particle-drift`, `forge-flash`.
  - `.vybe-forge-orb`, `.vybe-forge-grid`, `.vybe-forge-panel`, `.vybe-forge-chip`, `.vybe-forge-corner-brackets`.

**No new dependencies.** Uses existing framer-motion + Tailwind + CSS variables.

**Preserved behavior:**
- All state (`selectedVibe`, `selectedFont`, `selectedAnimation`, `customPrompt`, `step`, `buildPhase`, `generatedTheme`).
- `generateTheme`, `handleKeep`, `handleTryAgain`, `handleRevert`, snapshot/restore, `navVisibility.setInDesigner`.
- `VybeGenerationAnimation`, `FontSelector`, `AnimationSelector` components reused as-is.
- `isValidTheme` validator unchanged (recent fix preserved).

**Performance:**
- All animated layers use `transform`/`opacity` only.
- `will-change` only on actively-animating elements (orb, rings).
- Particles capped at 12, grid is single CSS layer.
- Full `prefers-reduced-motion` fallback: static orb, no rotation, no particle drift, no grid scroll.

**Mobile:**
- Designed against 985×649 viewport and smaller (375×812 baseline).
- Honeycomb vibe layout collapses to 2-col grid below 360px.
- Safe-area insets respected on top + bottom.
- Touch targets stay ≥44px.

**Theme safety:**
- All neon colors derived from `hsl(var(--primary))` / `hsl(var(--accent))` so the forge looks correct in light mode too.
- Glass panels use `bg-card/60` + `backdrop-blur` — falls back cleanly without backdrop-filter support.

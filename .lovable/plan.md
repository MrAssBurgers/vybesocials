## Goal

The video shows a slow, organic, blurred aurora — large soft color blobs that drift and morph, not a hard left-to-right sweep. Today the project's `.gradient-animated` and `.seamless-gradient-strip` classes use a 1D `linear-gradient` slid horizontally via `gradient-shift`, which gives a banded marquee feel. We'll upgrade them to a multi-layer radial "aurora" using the existing VYBE tokens (`--neon-pink`, `--neon-purple`, `--neon-cyan`) so every place that already uses these classes inherits the new look — no component changes needed.

## Changes (single file: `src/index.css`)

1. **Rewrite `.gradient-animated`** (lines ~1342-1360)
   - Replace the single `linear-gradient` + `background-size: 200% 100%` with **3 stacked radial-gradient blobs** (pink, purple, cyan) on a deep navy base.
   - Use `background-size: 200% 200%` so blobs are larger than the container.
   - Drive it with a new `aurora-drift` keyframe that animates `background-position` of each layer to **different positions on different timings** (think 18s / 22s / 26s) for an organic morph.
   - Add a subtle `filter: blur(0.5px) saturate(1.1)` so edges feel soft like the video.

2. **Rewrite `.seamless-gradient-strip`** (lines ~1362-1380)
   - Same aurora technique, slightly faster (~14s) and tuned for thin strips (`background-size: 300% 300%` so blobs sweep through narrow bars smoothly).

3. **Add new keyframes** (near other `@keyframes` around line 1722)
   - `@keyframes aurora-drift` — animates `background-position` for 3 comma-separated layers between 4 keyframe stops (0%, 33%, 66%, 100%) so it loops seamlessly.
   - Keep existing `gradient-shift` keyframe untouched (other classes might use it).

4. **Reduced motion safety**
   - Inside the existing `@media (prefers-reduced-motion: reduce)` block, freeze `.gradient-animated` and `.seamless-gradient-strip` to a static aurora (no animation).

## Visual target

```text
deep navy background
 + radial blob (neon-pink, ~40% opacity)   drifting top-left ↔ bottom-right
 + radial blob (neon-purple, ~35% opacity) drifting bottom-left ↔ top-right
 + radial blob (neon-cyan, ~40% opacity)   drifting right ↔ left
 = slow VYBE aurora, matches the video's soft morphing feel
```

## What inherits the new look automatically

Every component already using `.gradient-animated` or `.seamless-gradient-strip` (story rings, badges, animated buttons, banners, etc.) — no component edits required.

## Out of scope

- `.gradient-static` (intentionally non-animated) — leave as is.
- `.gradient-text` and `.story-ring-gradient` — these are pure linear gradients used for text/ring fills where a radial aurora would look wrong.
- Per-component one-off `linear-gradient(...)` inline styles — they're decorative borders/overlays, not the "animated linear gradients" the user is referring to.

If you'd like the aurora applied to those too (e.g. animated gradient text), say the word and I'll extend it.

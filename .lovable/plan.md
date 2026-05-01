## Problem

Text like "Alerts/Quests/Settings" disappears into pinkish/purple themed surfaces because static color tokens (`text-muted-foreground`, `text-foreground/60`, etc.) don't know what color the surface behind them actually is. Custom user themes can paint any background, so a fixed color scheme can never stay readable.

The user wants automatic detection: at runtime, measure each text element's actual contrast against its real background, and if it's blending in, fix it on the spot.

## Solution

Build a runtime "Contrast Auto-Guard" that observes text elements, computes WCAG contrast against the effective background, and rewrites the color when contrast falls below threshold. No per-component refactor required.

### 1. New utility — `src/lib/contrastGuard.ts`

Pure helpers (no React):
- `parseColor(str)` — parses any computed CSS color (`rgb()`, `rgba()`, `hsl()`, `oklch()`) to linear RGB.
- `relativeLuminance(rgb)` — WCAG formula.
- `contrastRatio(fg, bg)` — returns 1.0–21.0.
- `getEffectiveBg(el)` — walks up ancestors blending semi-transparent backgrounds (alpha-composite) and any backdrop-filter parent until a fully opaque color is found. Falls back to `<body>` background.
- `pickReadable(bg)` — returns either near-white `hsl(0 0% 96%)` or near-black `hsl(240 10% 8%)`, whichever wins contrast against `bg`.

### 2. New hook — `src/hooks/useContrastAutoGuard.ts`

A single global hook mounted once in `App.tsx`:

```text
on mount + theme change + route change + DOM mutation (debounced 200ms):
  1. querySelectorAll text-bearing nodes:
     [data-auto-contrast], .text-muted-foreground, .text-foreground\/60,
     .text-foreground\/70, p, span, label, button, a, h1-h6
     (skip nodes inside [data-no-auto-contrast], <img>, <svg>, <video>)
  2. for each node with non-empty trimmed text:
       fg = computed color
       bg = getEffectiveBg(node)
       ratio = contrastRatio(fg, bg)
       if ratio < 4.5 (AA body) or < 3 for large text:
         node.style.setProperty('color', pickReadable(bg), 'important')
         node.dataset.contrastFixed = ratio.toFixed(2)
       else if node.dataset.contrastFixed && ratio for original >= 4.5:
         node.style.removeProperty('color')  // restore
```

Triggers:
- `MutationObserver` on `document.body` (childList + attributes: class/style) — debounced rAF.
- `IntersectionObserver` so off-screen nodes are processed only when visible (perf).
- Listens to `themechange` custom event already dispatched by `ThemeProvider`.
- Re-runs on `resize` (debounced) for breakpoint-driven background swaps.

Performance budget:
- Batched in `requestIdleCallback` (fallback `setTimeout 16ms`).
- Caches last `(fg, bgKey)` per element via `WeakMap` so unchanged nodes are skipped.
- Hard cap: max 400 nodes per pass; queue overflow into next idle tick.
- Disabled entirely when user has `prefers-reduced-data` or on low-power devices (checks `navigator.deviceMemory < 2`).

### 3. Opt-out + opt-in attributes

- `data-no-auto-contrast` on a parent → guard skips its subtree (use on gradient text like `StyledUsername`, brand logos, AI watermarks).
- `data-auto-contrast="strict"` → use AAA threshold (7.0) instead of 4.5.
- `data-auto-contrast="off"` → never touch.

Apply `data-no-auto-contrast` to:
- `src/components/ui/StyledUsername.tsx` wrapper span (gradient names must keep their fill).
- AI watermark badges, premium gradient buttons, color swatches.

### 4. Wire-up

- `src/App.tsx` — call `useContrastAutoGuard()` once at the root, after providers.
- `src/index.css` — add a tiny safety rule so the inline `style.color` set by the guard wins over Tailwind utilities without `!important` collisions:
  ```css
  [data-contrast-fixed] { color: var(--auto-contrast-color, inherit) !important; }
  ```
  (the hook will set `--auto-contrast-color` on the element instead of inline `color`, which is cheaper to revert).

### 5. Dev visibility

Behind a `localStorage.debugContrast === '1'` flag, log a console table of every element that was rewritten with its measured ratio. Helps QA themed surfaces.

## Files

- `src/lib/contrastGuard.ts` — new, ~120 lines (color math + bg walker)
- `src/hooks/useContrastAutoGuard.ts` — new, ~150 lines (observer + scheduler)
- `src/App.tsx` — 2 lines (import + hook call)
- `src/index.css` — ~5 lines (safety selector)
- `src/components/ui/StyledUsername.tsx` — add `data-no-auto-contrast` to gradient span (1 attribute)
- A handful of cosmetic-only spots (gradient buttons, AI badges) — add the same attribute as discovered

## Out of scope

- No changes to design tokens themselves; the guard is purely reactive.
- Doesn't touch images, icons, or videos.
- Doesn't override gradient/text-fill effects (opted out via `data-no-auto-contrast`).

## Result

Any text on any user theme — pink, purple, light, dark, custom — automatically flips to a readable shade the moment contrast drops below WCAG AA. New components inherit the protection for free; nothing has to be hand-tuned again.

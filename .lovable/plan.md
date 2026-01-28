
# Fix: Custom Background Image Not Visible (Wrong Layer)

## Problem Analysis

After investigating the codebase, I identified the root cause: **the body's solid background gradient is painting OVER the `::before` pseudo-element** that contains the custom background image.

### Current Layer Structure (Broken)

```text
+----------------------------------+
|  UI Content (posts, cards, etc.) |  z-index: auto (positive)
+----------------------------------+
|  body background gradient        |  PAINTED ON BODY ITSELF
|  (solid dark gradient - lines    |  (covers everything behind it)
|   180-185 in index.css)          |
+----------------------------------+
|  body::after (readability overlay)|  z-index: -9
+----------------------------------+
|  body::before (background image) |  z-index: -10
+----------------------------------+
```

The problem is that CSS pseudo-elements with negative z-index appear **behind** their parent's background. Since the `body` element has a solid gradient background, the `::before` pseudo-element (with the user's image) is painted behind it and thus invisible.

---

## Solution: Restructure Layer Hierarchy

### Target Layer Structure (Fixed)

```text
+----------------------------------+
|  UI Content Layer                |  z-index: auto (positive)
|  - posts, buttons, nav bars      |
|  - modals, cards                 |
+----------------------------------+
|  Glass Overlay / Surface Layer   |  Semi-transparent surfaces
|  - liquid-glass-card             |  (backdrop-filter enabled)
|  - NO solid backgrounds          |
+----------------------------------+
|  Readability Overlay             |  z-index: 1 (inside #root)
|  (gradient for text contrast)    |
+----------------------------------+
|  Custom Background Image         |  z-index: 0 (inside #root)
|  - full viewport, fixed          |
+----------------------------------+
|  Fallback Background (body)      |  On body element
|  - solid color only              |  (only visible if no image)
+----------------------------------+
```

---

## Implementation Steps

### 1. Modify Body Background (src/index.css)

**Change:** When a custom background image is set, remove the solid gradient from body and make it transparent.

```css
/* Default body background (fallback) */
body {
  background: hsl(var(--background));
  /* Remove the gradient - use solid color as fallback only */
}

/* When custom background is active, make body transparent */
html[data-has-bg-image="true"] body {
  background: transparent !important;
}
```

### 2. Move Background Image Layer INSIDE the DOM (src/index.css)

**Change:** Instead of using `body::before`, create a dedicated background container at the root level that sits ABOVE body but BELOW content.

```css
/* Background image container - rendered as fixed layer */
html[data-has-bg-image="true"] #root::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  background-image: var(--bg-image-url);
  background-size: cover;
  background-position: center center;
  opacity: var(--bg-image-opacity, 0.5);
  filter: blur(var(--bg-image-blur, 0px));
  pointer-events: none;
}

/* Readability overlay - just above image */
html[data-has-bg-image="true"] #root::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 1;
  background: linear-gradient(
    to bottom,
    hsl(var(--background) / 0.6) 0%,
    hsl(var(--background) / 0.4) 50%,
    hsl(var(--background) / 0.6) 100%
  );
  pointer-events: none;
}
```

### 3. Ensure Content Has Proper Z-Index (src/index.css)

**Add:** Give all main content containers a z-index that places them above the background layers.

```css
/* All app content above background */
#root > * {
  position: relative;
  z-index: 2;
}
```

### 4. Update Glass Card Transparency (src/index.css)

**Change:** Reduce opacity on glass cards when background image is active so the image shows through subtly.

```css
/* When background image is active, make cards more transparent */
html[data-has-bg-image="true"] .liquid-glass-card {
  background: linear-gradient(
    160deg,
    hsl(var(--card) / 0.75),
    hsl(var(--neon-purple) / 0.03),
    hsl(var(--card) / 0.65)
  );
}
```

### 5. Fix the Active Background Application (src/hooks/useCustomTheme.ts)

**Verify:** Ensure the `useApplyActiveBackground` hook correctly sets:
- `--bg-image-url` CSS variable
- `data-has-bg-image="true"` attribute on `<html>`

### 6. Live Update Support

**Ensure:** When `BackgroundCustomizer` uploads or applies a background:
1. Set CSS variable immediately
2. Set data attribute immediately
3. No page reload required

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/index.css` | Restructure layer hierarchy, update body/root pseudo-elements, adjust glass card transparency |
| `src/hooks/useCustomTheme.ts` | Verify/fix `applyThemeTokens` and `useApplyActiveBackground` |
| `src/components/settings/BackgroundCustomizer.tsx` | Ensure immediate application of background |

---

## Technical Details

### Why This Fixes the Issue

1. **Body becomes transparent** when a background image is active, allowing layers beneath to show through
2. **Background image moves to `#root::before`** which is a child of body, so it renders ABOVE body's background
3. **Content gets explicit z-index: 2** ensuring it floats above the background layers
4. **Glass cards become more transparent** to allow the background to subtly show through

### Mobile Considerations

- Use `background-attachment: scroll` on mobile to prevent rendering issues
- Maintain touch scrolling performance with `contain: layout style`

### Fallback Behavior

- When no custom background: solid `hsl(var(--background))` color
- If image fails to load: fallback to solid color automatically
- If URL is invalid: gracefully degrade to default

---

## Pass Conditions

After implementation:
- Uploaded image visible behind posts and buttons
- UI floats above the image cleanly with glass effect
- Black background only appears when no image is set
- Background persists across pages and refresh
- Background syncs via database
- Background appears in "My Backgrounds" library



## Fix: Custom Background Not Applying

### Root Cause

In `src/index.css` line 517-518:
```css
body.has-custom-bg {
  background: none !important;
}
```

This CSS rule uses `background: none !important` which is a **shorthand** that resets ALL background properties — including the `background-image` that `applyBodyBackground()` just set via inline styles. The `!important` flag wins over inline styles, so the custom wallpaper is immediately wiped out.

The same issue exists for light mode on lines 580-583.

### Fix

Replace the broad `background: none !important` with targeted resets that only clear the **default gradient** without touching `background-image`:

**File: `src/index.css`**

1. **Line 517-519** — Change `body.has-custom-bg` rule from `background: none !important` to only reset `background-color`:
```css
body.has-custom-bg {
  background-color: transparent !important;
}
```
This clears the dark default background color without nuking the inline `background-image`.

2. **Lines 580-583** — Same fix for light mode: change from `background: none !important` to:
```css
.light body.has-custom-bg,
body.light.has-custom-bg {
  background-color: transparent !important;
  background-image: none; /* Remove the light gradient, but inline style will override this */
}
```
Wait — we actually need to remove the light-mode gradient (lines 570-578) without removing the inline `background-image`. The solution: the light gradient is set via the CSS `background` shorthand. We need to ensure that when `has-custom-bg` is present, only the gradient is suppressed. Since `applyBodyBackground()` sets `body.style.background = 'none'` first then sets `body.style.backgroundImage`, the inline styles should win — **except** the `!important` flag in CSS beats inline styles.

**Correct approach**: Remove `!important` from the body background rules, or switch to only resetting properties that don't conflict:

```css
body.has-custom-bg {
  /* Don't use background shorthand — it kills the inline background-image */
  background-color: transparent !important;
  background-image: var(--custom-bg-passthrough, unset); /* let inline win */
}
```

Actually simplest: just remove the `body.has-custom-bg` background rule entirely. The `applyBodyBackground()` function already sets `body.style.background = 'none'` before setting `backgroundImage`, which clears the default gradient. The CSS rule is redundant AND destructive.

### Final Plan

**`src/index.css`** — 2 changes:

1. **Line 517-519**: Remove `background: none !important` from `body.has-custom-bg`. The inline JS already handles clearing the default background. Keep only the `#root` and child transparency rules.

2. **Lines 580-583**: Remove `background: none !important` from the light-mode `has-custom-bg` rule. Same reason — the JS inline style already handles it.

This is a 2-line CSS fix. No other files need changes.


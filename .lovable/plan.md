
# Fix Text Transparency on Mobile/Tablet

## Problem Analysis

Your text is appearing solid on desktop but becomes transparent or broken on tablet/phone because of conflicting CSS rules. Here's what's happening:

### Root Cause

In `src/index.css`, there's a mobile-specific CSS block (for screens under 1024px) that forces ALL text to be fully opaque:

```css
@media (max-width: 1024px) {
  p, span, a, label, button {
    color: hsl(var(--foreground)) !important;  /* ← This breaks gradient text */
    opacity: 1 !important;
  }
}
```

This `color: !important` rule overrides the `color: transparent` that gradient usernames need to display properly. The gradient text works by:
1. Setting a gradient background on the text
2. Making the text color **transparent** so the gradient shows through

When mobile CSS forces `color: hsl(foreground) !important`, the text becomes solid white/gray instead of showing the gradient, and it can also cause opacity flickering.

---

## Solution

I'll update the mobile readability CSS rules to **exclude elements that use gradient text**. This preserves the readability improvements for regular text while allowing styled usernames and gradient effects to work correctly.

### Changes to Make

**File: `src/index.css`**

1. **Add exclusion for gradient text elements** in the mobile CSS rules (lines 238-266):
   - Change `p, span, a, label, button` to exclude elements with `background-clip: text` styling
   - Add a CSS marker class or use `:not()` selectors to preserve gradient text

2. **Specific selectors to modify**:
   - `span` → `span:not([style*="background-clip"])` 
   - Add override rules that restore gradient text behavior for styled elements

3. **Add a protective class** `.gradient-text-preserve` that elements can use to opt-out of the forced color

---

## Technical Implementation

### Step 1: Modify Mobile CSS Rules

Update lines 238-241 to exclude gradient-styled elements:

```css
/* All text elements - full opacity with subtle shadows */
/* EXCEPT elements using gradient text (background-clip: text) */
p:not([style*="transparent"]), 
a:not([style*="transparent"]), 
label, 
button {
  color: hsl(var(--foreground)) !important;
  opacity: 1 !important;
}

/* Spans need special handling - many use gradient text */
span:not([style*="WebkitTextFillColor"]):not([style*="-webkit-text-fill-color"]):not(.gradient-text) {
  color: hsl(var(--foreground)) !important;
  opacity: 1 !important;
}
```

### Step 2: Add Gradient Text Override

Add a new rule that ensures gradient text elements keep their transparency:

```css
/* Preserve gradient text on mobile - must override the above rules */
[style*="background-clip: text"],
[style*="backgroundClip"],
[style*="-webkit-background-clip: text"],
.gradient-text {
  color: transparent !important;
  -webkit-text-fill-color: transparent !important;
  opacity: 1 !important;
}
```

### Step 3: Update Similar Problem Rules

Apply the same fix to:
- Lines 244-247: `.font-bold, strong` selectors
- Lines 256-259: `[class*="username"]` selectors 
- Lines 263-266: `[role="tabpanel"]` selectors

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/index.css` | Update mobile CSS rules (lines 230-295) to exclude gradient-styled elements using `:not()` selectors and add protective override rules |

---

## Result

After this fix:
- ✅ Regular text stays fully opaque and readable on mobile/tablet
- ✅ Gradient usernames and styled text display their gradients correctly
- ✅ No more "works for a second then goes transparent" behavior
- ✅ Consistent appearance across desktop, tablet, and phone



## Fix "Online Friends" Header Text Cutoff

The "Online Friends" header text is being cut off at the top of the right sidebar because the content padding is too tight.

---

### Root Cause

In `DesktopRightSidebar.tsx`, the sidebar uses:
- `sticky top-0` on the aside element
- `p-3` padding on the content container inside ScrollArea

The `p-3` (12px) padding is too small, causing the uppercase header text to get clipped at the very top edge of the visible area.

---

### Solution

Increase the top padding of the content container from `p-3` to `pt-4 px-3 pb-3` (or use `p-3 pt-4`) to give the header more breathing room at the top.

---

### File to Update

| File | Change |
|------|--------|
| `src/components/layout/DesktopRightSidebar.tsx` | Line 187: Change `p-3` to `p-3 pt-4` on the content div |

---

### Code Change

```tsx
// Before (line 187)
<div className="p-3 space-y-3">

// After
<div className="p-3 pt-4 space-y-3">
```

This adds extra top padding (16px instead of 12px) to ensure the "ONLINE FRIENDS" text isn't cut off.


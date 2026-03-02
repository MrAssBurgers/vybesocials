

## Fix: Comment Dropdown Popup Movement on Hover

### Root Cause
The current `animate-[fade-in_0.15s_ease-out]` class references the global `fade-in` keyframes, which include `transform: translateY(10px)` -- this physically shifts the popup 10px downward as it fades in. When hovering triggers re-renders or re-animations, the popup visibly jumps.

### Solution
Replace the `fade-in`/`fade-out` animation (which uses translateY) with a pure opacity-only animation that keeps the popup completely still.

### Changes

**File: `src/components/comments/CommentItem.tsx`**

Update the `DropdownMenuContent` className to use inline keyframes that only animate opacity (no transform/translate):

- **Remove**: `animate-none data-[state=open]:animate-[fade-in_0.15s_ease-out] data-[state=closed]:animate-[fade-out_0.1s_ease-in]`
- **Add**: `data-[state=open]:animate-[opacity-in_0.15s_ease-out] data-[state=closed]:animate-[opacity-out_0.1s_ease-in]`

Where `opacity-in` is defined as `{ from { opacity: 0 } to { opacity: 1 } }` and `opacity-out` as `{ from { opacity: 1 } to { opacity: 0 } }` -- pure opacity, zero movement.

This is a single-line className change in one file. No business logic or database changes.


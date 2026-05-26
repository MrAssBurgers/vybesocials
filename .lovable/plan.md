## What's broken

**1. Tapping a shared theme in a DM is glitchy / doesn't open cleanly**

`SharedThemeMessageBubble` renders a `<button>` that opens `ReceivedThemeSheet`. The sheet is rendered as a sibling of the bubble (inside the message row in `ChatView`), with:

- `z-[100]` — too low. Chat overlay (`data-dm-active`), top bar, and several chat sheets sit above this, so the sheet can appear behind the chat header / nav.
- It is **not portaled** to `document.body`, so it inherits transforms, `overflow-hidden`, and pointer handlers from the message row → click sometimes opens then immediately dismisses, animation jumps.
- Tap on the bubble bubbles up to the row's `onClick` / long-press handlers in some cases.

**2. Long-press menu on a DM message falls off the screen**

The `DMHoldMenu` itself is centered and fine. The bug is the **separate "Quick reactions popup"** in `ChatView.tsx` (lines ~2792–2820), positioned `absolute bottom-full mb-2` relative to the bubble. When the held message sits near the top of the viewport, the popup renders above the screen edge and is partially/fully clipped.

## Fix

### A. Shared theme tap — make it solid

- `src/components/themes/ReceivedThemeSheet.tsx`
  - Wrap the overlay in `createPortal(..., document.body)` so it escapes the chat row's stacking/transform context.
  - Raise z-index from `z-[100]` → `z-[9999]` (matches `VybeViewer`, the standard fullscreen-over-DM layer).
  - Add `onClick={(e) => e.stopPropagation()}` on the inner content so taps inside the sheet don't bubble.
- `src/components/messages/bubbles/SharedThemeMessageBubble.tsx`
  - Add `onClick={(e) => { e.stopPropagation(); setOpen(true); }}` and `onPointerDown={(e) => e.stopPropagation()}` so the message row's tap / long-press handlers don't fight the button.
  - Disable the open transition flicker by guarding `setOpen(true)` only when `theme` is resolved (currently still fires while `disabled`).

### B. Long-press quick-reactions popup — keep it on screen

- `src/components/chat/ChatView.tsx` (the inline reactions popup ~line 2792)
  - Measure the bubble position on open with `getBoundingClientRect()` (via a ref + `useLayoutEffect` when `showReactions` flips true).
  - If `rect.top < 80` (not enough room above for the ~48px pill + safe area), render the popup **below** the bubble: swap `bottom-full mb-2` → `top-full mt-2`.
  - Clamp horizontal alignment so it never overflows: if `isOwn` and `rect.right > viewportWidth - 8`, shift with `right: 8px` inline; mirror for received side.
  - Wrap the pill in `max-w-[calc(100vw-16px)] overflow-x-auto no-scrollbar` as a safety net so the 6 emojis always fit on a 360-wide viewport.

No backend / business-logic changes — purely presentation and event-handling fixes.

## Files touched

```text
src/components/themes/ReceivedThemeSheet.tsx
src/components/messages/bubbles/SharedThemeMessageBubble.tsx
src/components/chat/ChatView.tsx
```

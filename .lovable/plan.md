

## Goal
Kill the leftover "blurred/dark backdrop" behind the bottom nav and make the nav actually get out of the way (auto-hide on scroll down, on input focus, and stop reserving blank space when hidden).

## Root causes

1. **Persistent backdrop strip behind the pill.** The nav pill (`mx-3 mb-2 rounded-[20px]`) sits on top of a full-width `<motion.nav>` that paints its safe-area padding area. With the dark `boxShadow: '0 4px 12px rgba(0,0,0,0.3)'` + the surrounding margin, you can see a dim band hugging the pill — that's the "blurred background thing." It's also visible even when `y: 120` animates out because the parent nav still occupies layout reserved by `AppLayout`'s `pb-[calc(5rem+env(safe-area-inset-bottom))]`.

2. **Nav doesn't actually go down when it should.** `useNavVisibility` only hides on a few explicit triggers (community chat, story viewer, designer, edit mode). It does NOT respect:
   - `useScrollDirection` (defined at top of file but **never used** in the render — dead code).
   - Soft keyboard / input focus on regular pages (only `RoomChat` wires it up).
   - Modal/sheet open states (DM input, comments full screen, etc.).
   So on every normal page the nav stays put and overlaps content.

3. **Reserved space stays even when nav is hidden.** `AppLayout` always reserves `pb-[calc(5rem+env(safe-area-inset-bottom))]` regardless of nav visibility. When the nav animates down, you get an empty band where it used to be.

## Fix plan

### A. Remove the visible "backdrop" around the pill
`src/components/layout/BottomNav.tsx`

- Drop the dark `boxShadow: '0 4px 12px rgba(0,0,0,0.3)'` on the non-edit-mode pill — replace with a subtle shadow tied to theme (`0 -2px 12px hsl(var(--background) / 0.4)`) or remove entirely. The big drop shadow is what reads as a "blurred background."
- Remove `border-white/10` border (or soften to `border-white/5`) — the white hairline on a dark page reads as a frame.
- Make the outer `<motion.nav>` element transparent and only paint the inner pill. Confirm no `bg-*` class leaks onto the parent.
- Result: just the dark pill floats — no visible band, no blur halo.

### B. Auto-hide on scroll down (re-enable existing dead code)
`src/components/layout/BottomNav.tsx`

- Wire `useScrollDirection()` (already implemented at lines 23–96 but unused) into the visibility calc:
  `const isVisible = useNavVisibility() && useScrollDirection();`
- Behavior: scroll down ≥10px past 50 → hide; scroll up or near top → show. Already implemented, just needs to be consumed.

### C. Auto-hide when keyboard / inputs are focused globally
`src/components/layout/BottomNav.tsx` (or new small hook)

- Add a global `focusin`/`focusout` listener that hides the nav when `document.activeElement` is `INPUT`, `TEXTAREA`, or `[contenteditable=true]`. Restore on blur.
- Also listen to `visualViewport` resize: if `window.visualViewport.height < window.innerHeight - 100` → keyboard open → hide nav. This catches iOS where focus event timing is unreliable.

### D. Stop reserving blank space when nav is hidden
`src/components/layout/AppLayout.tsx` (lines ~120–145)

- Subscribe to `navVisibility` (and the scroll/keyboard signal) to drive the bottom padding:
  - When nav is visible: keep `pb-[calc(5rem+env(safe-area-inset-bottom))]`.
  - When hidden: drop to `pb-[env(safe-area-inset-bottom)]`.
- Animate the padding change (CSS `transition: padding 0.3s`) so content gracefully reclaims the space instead of jumping.

### E. Sweep stale full-bleed surfaces near the nav
- Confirm no `<div className="fixed bottom-0 ... bg-*">` elements other than the nav itself paint a strip. (Quick grep of `fixed bottom-0` to verify.) If found, scope them or remove.

## Files to edit
- `src/components/layout/BottomNav.tsx` — remove dark shadow/border around pill; consume `useScrollDirection`; add global input/keyboard auto-hide.
- `src/components/layout/AppLayout.tsx` — make bottom padding follow nav visibility with smooth transition.
- (If sweep finds extras) any stray `fixed bottom-0` decorative element.

## Expected result
- No dim band, no blurred halo, no white hairline behind the bottom nav — just the clean dark pill.
- Nav slides down on scroll, when typing, and when keyboard opens; slides back up on scroll up / blur.
- Reserved bottom space collapses smoothly when nav hides — content no longer "blocked" by an empty band.


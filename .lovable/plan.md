
Goal: make swipe-to-reply and hold-to-open-menu mutually exclusive on media bubbles, especially on phone and iPad.

What the deep scan found
- `src/components/chat/SwipeToReply.tsx` still runs long-press from outer `onTouchStart/Move/End`.
- The inner `motion.div` handles drag with Framer’s pointer system, so a slow horizontal swipe can avoid the wrapper’s touch-move cancellation long enough for the 400ms menu timer to fire.
- Touch-only handlers are also less reliable on iPad/media children than pointer capture-phase handlers.
- `src/components/chat/ChatView.tsx` opens the menu through `document.querySelector(...).dispatchEvent(new CustomEvent('longpress'))`, which is brittle and makes this race harder to control.

Implementation plan
1. Harden `src/components/chat/SwipeToReply.tsx`
   - Replace long-press `onTouch*` logic with `onPointerDownCapture`, `onPointerMoveCapture`, `onPointerUpCapture`, and `onPointerCancelCapture`.
   - Start the 400ms hold timer only for `touch`/`pen` input, not mouse.
   - Add a smaller “swipe intent” cancel threshold that is lower than the 15px reply drag dead zone, so even a slow swipe cancels the menu immediately.
   - Track gesture state (`pressing`, `swiping`, `longpress-fired`) so once movement becomes a swipe, the menu cannot open later in that same gesture.
   - Keep the existing drag-side cancellation in `onDragStart` and `onDrag` as a second safety net.

2. Simplify menu opening in `src/components/chat/ChatView.tsx`
   - Remove the DOM custom-event bridge (`querySelector` + `CustomEvent('longpress')`).
   - Wire `SwipeToReply` directly to the current message’s menu-open state/callback so the correct bubble opens reliably.
   - Keep desktop right-click behavior through the existing `onContextMenu`.

3. Make hold-anywhere-on-image reliable
   - Keep the hold detector on the wrapper around the full bubble so presses on the actual image/video child still count.
   - Preserve media callout prevention so Safari/iPad native image menus do not interfere.

4. Verify the exact cases you reported
   - Holding still anywhere on the sent image opens the menu.
   - Swiping to reply, even slowly or partially, never opens the menu.
   - Full swipe still replies.
   - Vertical scrolling past media does not open the menu.
   - Same behavior works on phone-sized mobile and iPad.

Files to touch
- `src/components/chat/SwipeToReply.tsx`
- `src/components/chat/ChatView.tsx`

No backend changes are needed for this fix.

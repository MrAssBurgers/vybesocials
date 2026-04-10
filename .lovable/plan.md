

## Fix Three Issues: Home Background Visibility, Swipe-Reply Menu Conflict, Long-Press Menu Not Appearing

### Issue 1: Custom Background Not Visible on Home Screen

**Root cause**: The CSS on `body` uses the `background` shorthand property (line 496 of `index.css`) which sets a `linear-gradient`. When AppBackground sets `body.style.backgroundImage` inline, the CSS gradient can still interfere because the shorthand isn't fully overridden. More importantly, the gradient itself renders as an opaque layer underneath the image. When the custom background is active, the body's default gradient needs to be removed entirely so only the user's image shows.

**Fix**:
- In `src/components/layout/AppBackground.tsx`: When applying a custom background, also set `body.style.background = 'none'` to clear the CSS gradient entirely before setting `backgroundImage`. When clearing, restore by removing the inline `background` so the CSS gradient takes over again.
- In `src/index.css`: Add a rule for `body.has-custom-bg` that sets `background: none !important` to ensure the gradient doesn't paint over the user's image.

### Issue 2: Swipe-to-Reply Triggering Context Menu

**Root cause**: The `handleTouchMove` callback in `MessageBubble` is empty — it never cancels the long-press timer. So when the user swipes horizontally to reply, the 400ms timer fires mid-swipe and opens the context menu. The `SwipeToReply` component uses framer-motion `drag`, which captures pointer events, but the `onTouchStart`/`onTouchMove` on the inner bubble still fires.

**Fix in `src/components/chat/ChatView.tsx`**:
- Track the touch start position in `handleTouchStart`
- In `handleTouchMove`, calculate distance moved. If horizontal movement exceeds 10px (user is swiping), cancel the long-press timer
- This prevents the menu from popping up during a swipe gesture

### Issue 3: Long-Press on Images/VybeSnaps — Haptic But No Menu

**Root cause**: The haptic feedback the user feels is from `SwipeToReply`'s drag threshold (line 67-69 of SwipeToReply.tsx), NOT from the long-press handler. The `handleTouchStart` in `MessageBubble` sets a 400ms timer, but framer-motion's `drag` handler on `SwipeToReply` intercepts the touch events. The drag system calls `e.preventDefault()` which blocks the touch from reaching the inner bubble's handlers. Even slight finger movement triggers the drag, and the drag's haptic fires at the 50px threshold — so the user feels haptic but it's from the swipe system, not the menu system.

**Fix in `src/components/chat/ChatView.tsx`**:
- Store the touch start coordinates
- In `handleTouchMove`, only cancel long-press if the user moved more than 10px (existing comment says this but the code doesn't implement it)
- Add `e.stopPropagation()` in the touch handlers to prevent framer-motion's drag from stealing the event during a stationary hold
- This ensures holding still for 400ms opens the menu, while swiping triggers reply

**Fix in `src/components/chat/SwipeToReply.tsx`**:
- Add a small dead zone: only start the drag after 15px+ of horizontal movement. This gives the long-press timer time to fire on a stationary hold without the drag system interfering.

### Files Touched

| File | Change |
|------|--------|
| `src/index.css` | Add `body.has-custom-bg { background: none !important }` |
| `src/components/layout/AppBackground.tsx` | Clear body gradient when applying custom background |
| `src/components/chat/ChatView.tsx` | Track touch position, cancel long-press on real movement (>10px), keep timer alive for stationary holds |
| `src/components/chat/SwipeToReply.tsx` | Add drag dead zone so stationary holds don't trigger drag |


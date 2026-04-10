

## Fix Long-Press Menu + Redesign Sticker Panel

### Issue 1: Long-Press Menu Not Firing on Stationary Hold

**Root cause**: `SwipeToReply` uses framer-motion's `drag="x"` which captures pointer events at the framework level. Even with the 15px dead zone, framer-motion internally tracks the pointer and can interfere with the inner bubble's `onTouchStart` long-press timer. The drag system steals the touch before the 400ms timer completes.

**Fix in `src/components/chat/SwipeToReply.tsx`**:
- Add `dragSnapToOrigin` and remove `dragConstraints` to let framer handle reset
- More importantly, use `onPointerDown` capture to detect stationary holds: if the user hasn't moved past the dead zone after 400ms, emit a custom event or call a callback prop
- Simpler approach: Pass a `onLongPress` callback from the parent. In `SwipeToReply`, attach our own `onTouchStart`/`onTouchMove`/`onTouchEnd` to the wrapper. Run the 400ms long-press timer there (above the drag layer). If movement stays under 10px, fire the long-press. This way the long-press detection happens OUTSIDE the drag system.

**Fix in `src/components/chat/ChatView.tsx`**:
- Move the long-press timer logic from `MessageBubble` into `SwipeToReply` via a new `onLongPress` prop
- `SwipeToReply` will handle touch tracking at its level (before framer-motion intercepts), and call `onLongPress` when a stationary 400ms hold is detected
- `MessageBubble` receives a `triggerContextMenu` prop that `SwipeToReply` calls

### Issue 2: Sticker Panel Redesign (Snapchat-style)

**Changes to `src/components/chat/StickerPanel.tsx`**:

1. **Remove per-sticker X buttons** — no more hover delete buttons on each sticker
2. **Add delete mode**: Single trash can icon in header toggles "delete mode"
3. **In delete mode**: Each sticker shows a selection checkbox overlay. A "Select All" button appears. A "Delete Selected" button confirms deletion
4. **Panel stays open after sending**: Remove `onClose()` from `handleSend` — tapping a sticker sends it but keeps the panel open
5. **Swipe-down to close**: Add `onDragEnd` with framer-motion — if user drags the panel down past a threshold, close it
6. **X button in header still closes it**

### Files Touched

| File | Change |
|------|--------|
| `src/components/chat/SwipeToReply.tsx` | Add `onLongPress` prop, handle touch tracking above drag layer |
| `src/components/chat/ChatView.tsx` | Pass long-press handler through `SwipeToReply` instead of on the bubble div |
| `src/components/chat/StickerPanel.tsx` | Redesign: bulk delete mode, stays open on send, swipe-down to close |


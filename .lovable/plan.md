

## Fix DM Gesture System — Instagram-Perfect Hold, Swipe, and Tap

### Root Cause

Framer Motion's `drag="x"` on `SwipeToReply` fires `onDragStart` immediately on any pointer movement, which calls `clearLongPress()` — killing the hold timer before it can fire. The gestures are fighting each other because drag detection activates before the hold has a chance to complete.

### Solution: Gesture State Machine with Mutual Exclusion

Replace the current overlapping gesture approach with a clean state machine: `idle → holding | swiping`. Once one wins, the other is locked out.

### Changes

**`src/components/chat/SwipeToReply.tsx`** — Complete rewrite of gesture logic:
- Remove `drag="x"` from the motion.div entirely. Use manual `onPointerDown/Move/Up` for everything.
- Implement a gesture state ref: `idle`, `holding`, `swiping`
- On pointer down: start 300ms hold timer
- On pointer move: if movement > 10px, cancel hold timer and enter `swiping` state. If in `holding` state, ignore movement.
- On 300ms timer fire: enter `holding` state, call `onLongPress()`, vibrate, lock out swiping
- Swipe only activates after horizontal drag > 40px dead zone
- Use `animate(x, ...)` manually for the swipe translation instead of Framer drag
- Add `whileTap`-style scale feedback: when pointer is down and not yet swiping, scale message to 0.96 via a motion value
- On pointer up: if in swiping state and past threshold, trigger reply. Reset everything.

**`src/components/chat/DMHoldMenu.tsx`** — Animation polish:
- Change spring config to `stiffness: 260, damping: 22` per spec
- Add backdrop blur (`backdrop-blur-sm`) for the dim overlay
- Menu animates from the message position (scale from 0.8 → 1, opacity 0 → 1)

**`src/components/chat/ChatView.tsx`** — Minor wiring:
- Ensure `handleMediaTap` only fires on clean taps (no swipe, no hold)
- The `onClick` on media div should check a `gestureConsumedRef` from SwipeToReply to avoid opening viewer after a hold/swipe

### Gesture Flow Summary

```text
pointer down
  ├─ start 300ms timer
  ├─ scale → 0.96 (visual feedback)
  │
  ├─ move > 10px? → cancel timer, enter SWIPING
  │   ├─ drag > 40px → show reply indicator
  │   └─ release past 50px → trigger reply
  │
  └─ 300ms elapsed, < 10px movement → enter HOLDING
      ├─ fire onLongPress() + vibrate
      ├─ show DMHoldMenu with spring(260, 22)
      └─ swipe locked out
  
pointer up (no state entered) → tap passthrough to children
```

### Files Modified
| File | Change |
|------|--------|
| `src/components/chat/SwipeToReply.tsx` | Rewrite: manual pointer tracking, gesture state machine, no `drag="x"` |
| `src/components/chat/DMHoldMenu.tsx` | Spring config update (260/22), backdrop blur |
| `src/components/chat/ChatView.tsx` | Guard media tap against consumed gestures |

No backend or database changes.


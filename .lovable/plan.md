

## Fix: Long-Press Menu Not Firing + Swipe Still Triggering Menu

### Root Cause

The problem is in `SwipeToReply.tsx` — framer-motion's `drag="x"` fires `onDragStart` almost immediately when a finger touches the draggable element, even before any real movement. Line 108 calls `cancelToSwipe()` inside `handleDragStart`, which clears the 400ms long-press timer before it ever has a chance to fire.

**Result:**
- **Hold on image** → timer starts → framer fires `onDragStart` → `cancelToSwipe()` kills the timer → menu never opens
- **Slow swipe** → timer starts → `onPointerMoveCapture` may not fire (framer captures pointer) → `onDragStart` eventually fires but if 400ms already passed, menu already opened

### Fix

Two changes in `src/components/chat/SwipeToReply.tsx`:

1. **Remove `cancelToSwipe()` from `handleDragStart`** — this is what kills the long-press timer prematurely on a stationary hold. The drag start event fires too early to know if the user is holding or swiping.

2. **Keep `cancelToSwipe()` in `handleDrag`** — this already fires on actual movement (line 120), which correctly cancels the timer once real swiping begins. Also add cancellation when `dragActivatedRef` flips to true (past the 15px dead zone) as a belt-and-suspenders measure.

3. **Suppress drag processing when long-press fired** — if `gestureStateRef.current === 'longpress-fired'`, also block `handleDragEnd` from triggering a reply.

### Files Touched

| File | Change |
|------|--------|
| `src/components/chat/SwipeToReply.tsx` | Remove `cancelToSwipe()` from `handleDragStart`; keep it only in `handleDrag` where real movement is detected |


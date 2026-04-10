

## Fix: Context Menu Appearing During Swipe-to-Reply

### Root Cause

The long-press timer (400ms) fires during a slow swipe because of a gap between the two cancellation mechanisms:

1. **Wrapper `onTouchMove`** — supposed to cancel if movement > 10px, but framer-motion's pointer capture on the inner `motion.div` can prevent these touch events from reaching the wrapper reliably
2. **`handleDragStart`** — cancels the timer, but only fires after the 15px dead zone is exceeded

So if the user swipes slowly (hasn't hit 15px for drag activation, and wrapper touch events aren't firing), the 400ms timer completes and opens the menu mid-swipe.

### Fix

In `src/components/chat/SwipeToReply.tsx`:

1. **Cancel long-press inside `handleDrag`** — this callback fires on every drag frame from framer-motion, even before the dead zone is crossed. Add `clearLongPress()` at the top of `handleDrag` so ANY horizontal movement detected by framer-motion kills the timer immediately.

2. This is the most reliable cancellation point because `handleDrag` fires from framer-motion's own pointer tracking system, which is the same system that intercepts the touch events.

### Change

| File | Change |
|------|--------|
| `src/components/chat/SwipeToReply.tsx` | Add `clearLongPress()` at the start of `handleDrag` callback, before the dead zone check |

Single line addition — `clearLongPress();` as the first line inside `handleDrag`, right after the `if (disabled || longPressFiredRef.current) return;` check.




## Fix: Story Viewer Drag/Swipe Glitch

**Problem**: The story viewer container uses `drag="x"` with `dragDirectionLock`, which only allows horizontal dragging. But `handleDragEnd` also checks for vertical swipe down (`info.offset.y > 100`) to close — this vertical check never fires correctly because the drag is locked to X-axis. When you swipe diagonally or vertically, Framer Motion's drag system fights the gesture: the container visually jitters as it tries to snap back along the X-axis while your finger moves vertically. The `touchAction: 'none'` also blocks all native scroll behavior, compounding the issue.

**Fix**: Change `drag="x"` to `drag` (allow both axes), add Y-axis drag constraints (`top: 0, bottom: 0`) so it snaps back, and increase `dragElastic` on Y to give a rubbery feel for the close gesture. Also add a `dragSnapToOrigin` to ensure clean snap-back when neither threshold is met.

### Changes to `StoryViewer.tsx`

1. **Change `drag="x"` to `drag={true}`** — allows both horizontal and vertical drag detection
2. **Update `dragConstraints`** to `{ left: 0, right: 0, top: 0, bottom: 0 }` — snap back on both axes
3. **Add `dragSnapToOrigin`** — ensures the container always returns to origin after drag ends (no stuck state)
4. **Fix `handleDragEnd`** — make horizontal vs vertical detection mutually exclusive: if the dominant axis is Y and offset > 100, close; if dominant axis is X and offset > threshold, navigate groups. This prevents both handlers firing on diagonal swipes.
5. **Change `touchAction` from `'none'` to `'pan-y'`** — unnecessary since drag handles it, but removing `none` prevents the browser from fighting touch events

**File**: `src/components/stories/StoryViewer.tsx` (single file change)


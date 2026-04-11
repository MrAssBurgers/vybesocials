

## Fix Draggable Overlay Movement in Camera Editor

### Problem
The drag interaction in `DraggableOverlay` feels sluggish and offset because every pixel of movement triggers a full React state update + re-render cycle through `onUpdate → setTextOverlays → re-render all overlays`. On mobile this causes visible lag between the finger and the element.

### Fix
Convert to a **ref-based drag** pattern: move the DOM element directly via `style` during the drag, then commit the final position to React state only on release. This eliminates per-frame re-renders and makes the overlay stick directly under the finger/cursor.

### Changes — single file: `src/components/camera/DraggableOverlay.tsx`

1. **Add a `divRef`** to the overlay `<div>` so we can update its `style.left` / `style.top` / `style.transform` directly during drag.

2. **During touch/pointer move**: instead of calling `onUpdate(id, {x, y})`, write directly to `divRef.current.style.left` and `divRef.current.style.top` via `requestAnimationFrame`. Update `currentPos.current` so the ref stays in sync.

3. **On touch/pointer end**: call `onUpdate(id, { x, y, scale, rotation })` once with the final position from `currentPos.current`, syncing React state.

4. **For pinch-to-scale/rotate**: also apply `transform` directly to the ref during the gesture, commit on end.

This gives 60 fps drag with zero React overhead during the gesture.


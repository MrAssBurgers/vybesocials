

## Instagram-Style Overlay Gestures for VYBE Snap Editor

### Problems

1. **Inaccurate drag**: Overlays use `left/top` percentage positioning with `transform: translate(-50%, -50%)` but framer-motion's `drag` applies pixel-based offsets on top. The initial position uses percentages but drag deltas are pixels — causing a mismatch where the element jumps or drifts away from your finger.

2. **No pinch-to-resize**: There's no multi-touch gesture handling. Instagram lets you use two fingers to scale and rotate overlays simultaneously.

3. **No rotation**: The overlay model has no `rotation` property and no gesture to set one.

### Solution — Replace framer-motion drag with custom multi-touch gesture handler

Drop `motion.div` with `drag` in favor of a custom touch handler per overlay that tracks:
- **One finger**: drag (reposition), using pixel offsets relative to finger-to-element anchor point
- **Two fingers**: simultaneous pinch-to-scale + rotation, computed from the angle/distance between the two touch points

This is exactly how Instagram Stories editor works.

### Changes

**`src/components/camera/CameraEditor.tsx`**

1. Add `rotation` and `scale` to `TextOverlay` interface
2. Replace `motion.div` overlays with a new `<DraggableOverlay>` component that uses raw touch events
3. `DraggableOverlay` tracks:
   - `onTouchStart`: record finger position(s) and element's current x/y. For two fingers, record initial distance and angle
   - `onTouchMove`: for one finger, compute delta from start and update position (pixel-based, converted to percentage). For two fingers, compute new scale (distance ratio) and rotation (angle delta)
   - `onTouchEnd`: finalize position/scale/rotation into overlay state
4. Position overlays with `transform: translate(x, y) scale(s) rotate(r)` instead of `left/top` percentages — this ensures the element stays exactly under the finger
5. Use `touch-action: none` on overlays to prevent browser scroll interference

**Key implementation details:**
- Store overlay position as pixel offsets from center, converted to/from percentages using container dimensions
- On drag start, calculate the offset between the touch point and the element center — maintain this offset throughout the drag so the element doesn't jump
- For pinch: `newScale = initialScale * (currentDistance / initialDistance)`
- For rotation: `newRotation = initialRotation + (currentAngle - initialAngle)` where angle = `Math.atan2(dy, dx)` between two fingers
- Delete overlay on tap (existing behavior) only if no drag/pinch occurred

### Files Touched

| File | Change |
|------|--------|
| `src/components/camera/CameraEditor.tsx` | Replace motion.div drag with custom multi-touch overlay component supporting drag, pinch-to-resize, and two-finger rotation |


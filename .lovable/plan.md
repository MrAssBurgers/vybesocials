

## Samsung-Style Widget System — Complete Rewrite Plan

### Problem Summary
The current drag/resize system has multiple reliability issues:
- Widget rects go stale during drag, causing missed swap targets
- Resize uses a threshold-based approach that feels rigid instead of continuous
- No visual grid preview during resize (Samsung shows an outline of the target size)
- The ghost element is a simplified placeholder instead of the actual widget
- Tap-to-select + drag separation has edge cases that break on touch devices

### How Samsung Widgets Actually Work
1. **Enter edit mode** → all widgets jiggle subtly
2. **Tap a widget** → it gets a selection frame with blue dot handles on edges/corners
3. **Drag the widget body** → it lifts up (scale + shadow), follows finger, other widgets slide apart in real-time with spring animations
4. **Drag an edge handle** → a semi-transparent grid overlay shows the proposed new size, snapping to grid cells. On release, the widget animates to the new size and neighbors reflow
5. **Everything is grid-locked** — no free-floating positions, widgets always snap into the CSS grid

### Plan

#### 1. Rewrite the drag engine in `HomeEditMode.tsx`

**Move system:**
- On pointer down anywhere on a selected widget (or long-press 200ms on unselected), begin drag
- Clone the widget DOM node into a fixed-position overlay (the "lifted" ghost) with `scale(1.05)` and elevated shadow
- The original widget stays in the grid but becomes a transparent placeholder (dashed border)
- On pointer move, update ghost position AND run hit-testing against live `getBoundingClientRect()` of all grid cells (not cached rects — read them fresh each frame via `requestAnimationFrame`)
- When the pointer center enters a different widget's bounds for >120ms, execute an order swap with `framer-motion layout` animation
- On pointer up, animate ghost back to the placeholder position, then remove ghost and restore widget

**Resize system:**
- When a widget is selected, show 3 handles: right edge (horizontal resize), bottom edge (vertical resize), corner (both)
- On pointer down on a handle, show a semi-transparent blue overlay rectangle that previews the target grid size
- As the user drags, calculate the target colSpan/rowSpan based on how many grid cells the overlay covers (using the grid's `gap` and `column width` from the container's own measurements)
- Snap the overlay to valid sizes (1×1, 2×1, 1×2, 2×2) in real-time
- On pointer up, apply the new size and animate the reflow with spring physics
- The preview overlay should pulse gently to feel alive

#### 2. Fix hit-testing with live rect reads

Replace the stale `widgetRectsRef` snapshot approach with a `requestAnimationFrame`-based live read:
```text
onPointerMove → rAF → read all [data-widget-id] rects → find hover target → swap if changed
```
This eliminates the #1 bug where cached rects become wrong after a swap.

#### 3. Improve the grid container

- Set explicit `grid-auto-rows: minmax(80px, auto)` so row heights are predictable
- Use `gap-3` consistently in both edit and non-edit modes
- The grid measures its own column width at drag start so resize calculations are pixel-accurate

#### 4. Polish animations and haptics

- Jiggle: reduce intensity to `±0.3deg` at `0.3s` — barely perceptible, professional
- Drag lift: `scale(1.05)`, `box-shadow: 0 20px 40px rgba(0,0,0,0.25)`, 120ms spring transition
- Swap reflow: `type: 'spring', damping: 28, stiffness: 350` — snappy but not jarring
- Resize preview: semi-transparent primary color overlay with `border-radius: 16px`
- Drop: ghost animates to final position with `duration: 0.25s ease-out`, then fades

#### 5. Files to modify

- **`src/components/home/HomeEditMode.tsx`** — Full rewrite of drag engine, resize handles, ghost rendering, and hit-testing
- **`src/components/home/HomeWidgetRenderer.tsx`** — Minor: ensure `data-widget-id` is on the correct outer element for hit-testing, clean up duplicate wrapper nesting

### Technical Details

**Drag ghost implementation:**
Instead of a simplified card, use `React.createPortal` to render the actual `<WidgetContent>` inside a fixed-position container during drag, with `pointer-events: none` and the lifted visual treatment.

**Live hit-testing (replaces stale rect cache):**
```text
let rafId: number;
const onMove = (ev: PointerEvent) => {
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    // Read fresh rects every frame
    const rects = new Map<string, DOMRect>();
    document.querySelectorAll('[data-widget-id]').forEach(el => {
      const id = el.getAttribute('data-widget-id');
      if (id && id !== dragId) rects.set(id, el.getBoundingClientRect());
    });
    // Find which widget the pointer is over
    for (const [id, rect] of rects) {
      if (pointInRect(ev.clientX, ev.clientY, rect)) {
        // Swap if different from last target and debounce 120ms
      }
    }
  });
};
```

**Resize preview overlay:**
A `position: fixed` div rendered via portal, sized to `N * columnWidth + (N-1) * gap` by `M * rowHeight + (M-1) * gap`, positioned at the widget's grid origin. Updates in real-time as the pointer moves.


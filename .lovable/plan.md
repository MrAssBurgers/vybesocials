

## Fix Camera Editor, Music Library, AR Filters & Animation Loop

### Issues identified
1. **Animation still snaps** — `background-size: 300%` with `background-position: 0% → 100%` shifts by 2 tiles (not a whole number of the 3-tile pattern). Fix: switch to `200%` with a 2-tile gradient (A-B-C-A) so the shift is exactly 1 tile.
2. **Text input broken in CameraEditor** — The text input has `autoFocus` but the container's `onPointerDown` fires on the input too, stealing focus for drawing mode. Need to stop pointer events from propagating when clicking the input.
3. **Text bar too opaque** — `bg-black/50` is heavy. Change to `bg-white/10 backdrop-blur-sm` for a lighter, tag-like feel.
4. **Emojis/stickers can't be moved on desktop** — `DraggableOverlay` only handles touch events, no mouse/pointer support. Add pointer event handlers alongside touch.
5. **No image overlay support** — Editor only supports text and stickers. Add an Image tool that opens a file picker, adds an image as a draggable/scalable overlay (like Snapchat/Insta).
6. **Story creator camera has no back button** — `Camera.tsx` receives `showBackArrow` but uses an inline SVG. The StoryCreator passes `showBackArrow` correctly, so this should work. Will verify and ensure the arrow renders properly with the ArrowLeft icon.
7. **Music library empty** — The `MusicGallery` loads from `licensed_tracks` table which is empty. Add a curated set of sample/placeholder tracks so the library isn't blank. Also add a "Browse Music" section in the SoundPicker.
8. **AR Filters** — Mark all AR filters as "Coming Soon" with a lock/badge overlay instead of trying to load them.

### Plan

**1. Fix animation loop (src/index.css)**
- Change `.gradient-animated` and `.create-button-gradient` to `background-size: 200% 100%` with a 4-stop gradient (A-B-C-A).
- Keep `gradient-shift` keyframe as `0% → 100%` — with 200% bg-size this shifts exactly one tile.
- Apply same fix to `.rainbow-name`, `.friendlink-shimmer`, `.animate-shimmer`.

**2. Fix CameraEditor text input & styling (src/components/camera/CameraEditor.tsx)**
- Add `onPointerDown={e => e.stopPropagation()}` on the text input wrapper so drawing mode doesn't hijack focus.
- Change text input style to `bg-white/10 backdrop-blur-sm border-white/10` for a lighter tag look.
- Add `onKeyDown` handler for Enter key to submit text.

**3. Add mouse/pointer support to DraggableOverlay (src/components/camera/DraggableOverlay.tsx)**
- Add `onPointerDown/Move/Up` handlers mirroring the touch logic so overlays work on desktop.
- Keep touch handlers for mobile pinch-to-zoom/rotate.

**4. Add image overlay support to CameraEditor**
- Add an Image tool button (ImageIcon) to the mode toolbar.
- When clicked, open a file picker. Selected image becomes a draggable overlay (reuse DraggableOverlay with an `<img>` child instead of text).
- Extend `DraggableOverlay` to accept `children` or an `imageUrl` prop for rendering images.
- Images are draggable, scalable, rotatable just like stickers.

**5. Add sample music to MusicGallery (src/components/music/MusicGallery.tsx)**
- Add a fallback set of ~12 built-in demo tracks (with royalty-free Pixabay preview URLs) when the `licensed_tracks` table is empty.
- Show them in a "Sample Library" section so the gallery isn't blank.

**6. Mark AR filters as Coming Soon (src/components/camera/ARFilterPicker.tsx)**
- Add a "Coming Soon" badge overlay on all AR filter circles.
- Disable filter selection, show a toast "AR Filters coming soon!" on tap.

**7. Verify story camera back button**
- Ensure `Camera.tsx` renders the ArrowLeft icon correctly when `showBackArrow` is true.

### Files to modify
- `src/index.css` — animation fix
- `src/components/camera/CameraEditor.tsx` — text input fix, image tool, transparent text bar
- `src/components/camera/DraggableOverlay.tsx` — pointer support, image overlay support
- `src/components/music/MusicGallery.tsx` — sample tracks fallback
- `src/components/camera/ARFilterPicker.tsx` — coming soon overlay
- `src/components/camera/Camera.tsx` — verify back arrow




## VybeSnap Editor — Complete Revamp

### Current Problems
1. **Tap-to-text only works when there are zero overlays** — tap anywhere should always open text input
2. **Text input is buried at the bottom** behind tool panels — Snapchat centers it on the image itself with a translucent bar
3. **No inline text editing** — text appears as a separate textarea at the bottom, not directly on the photo where it'll appear
4. **Tool buttons feel cluttered** — black/40 pills jammed together, no visual hierarchy
5. **No caption bar** — Snapchat has a bottom caption strip ("Add a caption...") that's always visible, separate from overlay text
6. **Send button is gradient-heavy and bulky** — should be a clean circle icon
7. **Color picker is hidden** until you select text/draw mode — should slide in smoothly
8. **Sticker panel is a plain horizontal scroll** — no search, no categories, feels flat
9. **No save-to-gallery button** visible
10. **Video overlays aren't rendered** — just sends raw URL with no indication

### Redesign

**1. Snapchat-style centered text input**
- Tapping anywhere on the photo opens a **full-width translucent text bar centered vertically on the image** (not at the bottom)
- Semi-transparent black background behind the text line, white text, auto-expanding
- Text style pills (Classic/Glow/Outline/Box/Neon) float above the text bar as a horizontal row
- Color palette appears as a vertical slider on the right edge (Snapchat-style) instead of horizontal dots at bottom
- Pressing Done/checkmark places the text as a draggable overlay

**2. Always-visible caption strip**
- A thin "Add a caption..." bar sits just above the send row at the bottom
- Tapping it opens a simple single-line input with the keyboard — this is for quick captions, not overlay text
- Caption renders as small white text at the bottom of the snap when sent

**3. Clean right-side tool strip**
- Move text (T), sticker, and draw tools to a **vertical strip on the right side** of the screen (like Snapchat's scissors/sticker/text/pencil column)
- Each tool is a 40px frosted circle, spaced 12px apart
- Add a download/save button to the strip

**4. Bottom send row redesign**
- Left: recipient name/avatar chip (or "Send to..." placeholder)
- Right: circular gradient send button (arrow icon only, no text)
- Caption bar sits just above this row

**5. Improved color picker**
- Vertical color slider on the right edge when in text or draw mode — a tall gradient strip you drag to pick color, plus 6 preset dots below it
- Much more intuitive than the current horizontal dot row

**6. Better sticker panel**
- Grid layout (4 columns) instead of horizontal scroll
- Slightly larger stickers (48px)
- Scroll area with max height

**7. Polish & animations**
- Text input slides in from center with a spring animation
- Tool strip fades in on mount
- Overlays have a subtle drop shadow for readability
- Send button pulses gently when media is ready
- Drag-to-trash: dragging an overlay toward bottom shows a trash zone

### Technical Details

**Files modified:**
- `src/components/camera/VybeSnapEditor.tsx` — Full rewrite (~500 lines)

**Files unchanged:**
- `VybeSnapCamera.tsx` — still passes same props to editor
- `VybeViewer.tsx` — viewing experience stays the same
- All hooks remain unchanged


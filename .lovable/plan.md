## Goals

1. Stop the instant crash when opening VybeSnap from a DM in the Despia native app
2. Replace the current cluttered camera + editor UI with a clean, organized Snapchat/Instagram-style design
3. Keep color filters, timer, grid, night mode (tucked behind a single "more" menu)
4. Drop AR/SnapLens from the DM Snap path so nothing heavy loads on open

---

## Part 1 — Crash fix (`VybeSnapCamera.tsx`, `CameraFirstOverlay.tsx`)

Suspected cause: on Despia (Android WebView in particular) the current open path runs several things synchronously that can throw before the camera surface mounts:

- `navigator.permissions.query({ name: 'camera' })` — not supported in Android WebView, can throw
- `getActiveStream()` may return a torn-down preloaded stream whose tracks are already ended
- `useFaceTracking` + `useSnapAR` are imported at module top; even if dynamic-loaded internally, the AR overlay/picker mount work runs on first render
- `getUserMedia` is requested before the video element is mounted, so failures bubble as render-time crashes

Fixes:

1. **Defensive open sequence in `startCamera`**
   - Wrap the `permissions.query` block in `try/catch` that swallows ALL errors (including the synchronous "Illegal invocation" Android WebView throws)
   - Validate `getActiveStream()` — if any video track has `readyState === 'ended'`, discard and request a fresh stream
   - Defer `getUserMedia` to a `requestAnimationFrame` after `setPhase('camera')` so the `<video>` is in the DOM first
   - Wrap the entire init in a top-level `try/catch` that sets `permissionDenied=true` instead of throwing

2. **Strip AR from the Snap path**
   - Remove `useFaceTracking`, `useSnapAR`, `AROverlayCanvas`, `ARFilterPicker` imports and usage from `VybeSnapCamera`
   - AR remains available in the main `Camera` component for posts; DM Snap stays lean
   - Drop the `activeARFilter`, `faces`, `arReady`, `arLoading` state and any UI that depends on them

3. **Mount safety**
   - `CameraFirstOverlay` already only renders camera when `isOpen` — keep that, and also unmount `VybeSnapCamera` (don't just set `isOpen=false`) when closing in `ChatView` (already done via `{showSnapCamera && ...}`); apply same pattern in `CameraFirstOverlay`
   - Add an early-return error boundary fallback inside `VybeSnapCamera` so a render-time throw shows a "Camera unavailable" panel instead of crashing the WebView

4. **Despia-specific**
   - Skip `permissions.query` entirely when `navigator.userAgent` contains `despia` (uses native bridge for permissions; the web API call is what crashes the wrapper)
   - Use `{ video: { facingMode }, audio: soundEnabled }` without advanced constraints on first attempt; only retry with constraints if the basic call succeeds

---

## Part 2 — Clean redesign (Snapchat/Instagram look)

### Capture screen (`VybeSnapCamera.tsx`)

Visual language:
- Pure black backdrop, full-bleed 9:16 viewport, no glass cards on top
- Floating glyph icons only (no labels, no chips around them) — 40px round, `bg-white/10 backdrop-blur-md`, white icon
- Type weights: medium for any small text, never bold
- All controls anchored either top-edge or bottom-edge, nothing in the middle

Top bar (single row, edge-to-edge padding 16):
- Left: `X` close
- Right cluster: `Bolt` (flash), `SwitchCamera` (flip), `MoreHorizontal` (opens a single sheet with timer / grid / night mode / sound toggle)

Bottom area (in this stacking order, bottom → up):
1. Shutter row: large `VybeRecordButton` centered, `Image` (gallery) bottom-left, `Sparkles` (filters) bottom-right — all on the same horizontal axis like Snapchat
2. Above shutter: thin filter strip when filters open — horizontal scroll of color filter chips (Normal, Warm, Cool, Vintage, Vivid, B&W, Dreamy, Noir) with the active one scaled `1.1` and ringed in white
3. No floating recipients list, no music search, no UserPlus button on capture

"More" sheet (`Sheet` from shadcn, slides up from bottom, glass black, rounded-t-3xl):
- Timer (3 chips: Off / 3s / 10s)
- Grid toggle row
- Night mode toggle row
- Sound toggle row
- One simple list — no toolbar

Recording UX unchanged (hold/tap, segments, max 30s) — only the visuals around it change.

### Editor screen (`VybeSnapEditor.tsx`)

Same visual language, IG-Stories style:
- Top bar: `X` left, `Download` + `Send` right (Send is white pill with arrow)
- Right rail (vertical stack of 40px glyphs, no labels): `Type` (text), `Smile` (stickers), `Pencil` (draw), `Music`
- Tap-anywhere to add text
- Drag handle for moving text/stickers retained, no ring chrome
- Bottom: single "Send to" pill that opens the recipient picker as a slide-up sheet (no inline avatar list cluttering the canvas)

### Tokens
- Use existing `bg-card`, `text-foreground`, `border-border` tokens; only camera/editor surface stays pure black for the photographic feel (this is acceptable — matches IG/Snap behavior and design memory's "bg-card over backdrop-blur" rule applies to high-frequency app UI, not media capture overlays)

---

## Out of scope
- No DB / RLS / edge function changes
- AR filters in the main `Camera.tsx` (posts) untouched
- Sending pipeline (`onSend`, `handleVybeSend`) untouched

## Files to edit
- `src/components/camera/VybeSnapCamera.tsx` — crash hardening + redesign + remove AR
- `src/components/camera/VybeSnapEditor.tsx` — redesign right rail + send sheet
- `src/components/chat/CameraFirstOverlay.tsx` — minor: ensure unmounts cleanly when closed

## Verification
- Open `/messages/:id` → tap camera → no crash; camera preview renders within ~400ms
- Filter strip swipes smoothly, "More" sheet opens/closes
- Capture → editor → send still produces a delivered media message
- On Despia Android build: open Snap from DM repeatedly without freezing

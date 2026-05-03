## Problems

1. **Friend Link sheet content doesn't scroll** — `LiquidBottomSheet` has `drag="y"` on the same motion.div that wraps the scrollable content. Framer Motion's vertical drag swallows touch events, so internal scrolling is dead. The user remembers it scrolling like a normal page, and also wants the panel slimmer.
2. **Camera takes too long to appear** — `preloadCameraStream()` is fired in `handleOpen`, but the `<video>` is only mounted after the user taps "Scan QR Code" and `startScanning()` runs `getUserMedia`/`play()`. Result: 1–2 s lag.
3. **Reactions other than 👍 aren't saved** — Confirmed via DB (`likes` table only contains `like` + a few `haha`). Root cause is in `ReactionPicker`: the picker is rendered through `createPortal` to `document.body`, but the outside‑click listener only checks `containerRef` (the trigger button). Tapping a reaction bubble fires `touchstart` first → the listener sees the target is *outside* `containerRef`, so it unmounts the picker before the bubble's `onClick` can fire. Only the trigger‑button single‑tap (`'like'`) ever lands.

## Fix Plan

### 1. `src/components/ui/glass/LiquidBottomSheet.tsx`
- Move `drag="y"` / `dragConstraints` / `dragElastic` / `onDragEnd` off the main sheet `motion.div` and apply them only to the small drag‑handle area at the top. Body scroll then works normally.
- On the inner scroll container add `style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}` to guarantee native momentum scrolling on Despia/Android.

### 2. `src/components/reactions/ReactionPicker.tsx` (the real "only thumbs‑up saves" bug)
- In the outside‑click effect, also bail out when the event target is inside `pickerRef.current` (the portal'd popup). Picker stays open long enough for the bubble's `onClick → handleSelectReaction` to fire, so love / haha / wow / sad / angry / care all save.
- Also make the bubble wrappers call `e.stopPropagation()` on `onTouchStart`/`onPointerDown` as a belt‑and‑suspenders guard.
- Verified DB column `likes.reaction_type` already supports all 7 types and `usePosts`/`useInfinitePosts`/`get_posts_with_counts` already round‑trip it — no DB or query change needed.

### 3. `src/components/friends/FriendDrop.tsx` — slim redesign + instant camera
- **Sheet height**: drop `maxHeight` from `70` → `58` and tighten paddings (`px-4 pb-5` → `px-3 pb-3`, gaps `gap-3` → `gap-2`).
- **Smaller QR**: `w-36 h-36` → `w-28 h-28`, QR API size `240x240` → `200x200`, surrounding white card padding `p-2.5` → `p-2`.
- **Smaller radar**: PhoneTapRadar `w-48 h-48` → `w-36 h-36`, ring widths scaled accordingly, center icon `w-16 h-16` → `w-12 h-12`.
- **Tighter copy/share pills**: `py-2` → `py-1.5`, font `text-[11px]` → `text-[10px]`.
- **Instant camera**:
  - Always mount the `<video>` element (hidden behind the QR until scanning starts) and attach the preloaded stream via a `useEffect` that watches `getPreloadedStream()` so the feed is already running before the user taps Scan.
  - Switch `handleOpen` to call `preloadCameraStream({ facingMode: 'environment', width: 640, height: 480 })` and `await` the resulting stream so it's live by the time the sheet finishes its open animation.
  - In `startScanning`, skip the `getUserMedia` round‑trip whenever `getPreloadedStream()` returns an active stream — just start the `requestAnimationFrame` jsQR loop. Visible camera in <100 ms.

### 4. Sanity sweep
- Quick `rg` for any other place using `LiquidBottomSheet` to make sure removing top‑level drag doesn't regress them (drag handle still gives swipe‑to‑close).
- No DB migration, no edge function change, no Capacitor change.

## Files Touched
- `src/components/ui/glass/LiquidBottomSheet.tsx`
- `src/components/reactions/ReactionPicker.tsx`
- `src/components/friends/FriendDrop.tsx`

## Out of Scope
- Aurora gradients, top status‑bar gap, wallet scroll, Despia push/NFC native bridges (already shipped previously).

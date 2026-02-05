
## What’s going wrong (root cause)
Right now the VYBE Snap camera that’s actually used in DMs is `src/components/camera/VybeSnapCamera.tsx` (it’s mounted from `src/components/chat/ChatView.tsx`).

In `VybeSnapCamera`, releasing the record button calls `stopRecording()`, and then it tries to “finalize” (merge segments and move to the edit screen) using a `setTimeout(..., 200)`.

The problem: the last segment is only appended inside `MediaRecorder.onstop`, which is asynchronous. So when the timeout runs, `segments` is often still empty (especially for the most common case: a single segment). `finalizeRecording()` then returns early (`if (segments.length === 0) return;`), and the UI stays on the camera screen — which feels like “nothing happens”.

So even if recording actually stops, the transition to the editor can fail due to timing/state lag.

## Goal
When you release after holding to record:
1) recording stops reliably
2) the video is finalized
3) you are taken immediately to the edit screen (`VybeSnapEditor`) where you can then send

## Implementation plan (code changes)
### 1) Fix finalize timing: finalize on `MediaRecorder.onstop` (not via a timeout)
**File:** `src/components/camera/VybeSnapCamera.tsx`

- Introduce refs to avoid relying on React state timing:
  - `segmentsRef = useRef<RecordingSegment[]>([])` as the “source of truth” for segments
  - `shouldFinalizeOnStopRef = useRef(false)` to indicate “this stop is the final stop (user released / max duration reached)”
  - `isRecordingRef = useRef(false)` to avoid stale `isRecording` reads during fast interactions

- Update `startRecordingSegment()`’s `mediaRecorder.onstop` to:
  1) build the segment blob
  2) push it into `segmentsRef.current` synchronously
  3) call `setSegments([...segmentsRef.current])` for UI
  4) if `shouldFinalizeOnStopRef.current === true`, immediately merge **all** blobs in `segmentsRef.current` into one final blob, create the URL, then:
     - `setCapturedMedia({ url, type: 'video' })`
     - `setPhase('edit')`
     - `stopCamera()`
     - reset `shouldFinalizeOnStopRef.current = false`

- Remove the current `setTimeout(... finalizeRecording ...)` flow from `handleCaptureEnd`. That timeout is the fragile part.

### 2) Make “stop” explicitly request finalization
**File:** `src/components/camera/VybeSnapCamera.tsx`

- Change the “release” path to:
  - set `shouldFinalizeOnStopRef.current = true`
  - call `stopRecording()` which triggers the `onstop` handler
  - do not attempt to finalize anywhere else

- Also do the same when the max duration is reached (auto-stop):
  - before calling `stopRecording()` at 30s, set `shouldFinalizeOnStopRef.current = true` so it will still go to the editor automatically.

### 3) Make the release event more reliable on mobile (optional but recommended)
Even with finalize fixed, it’s worth hardening the “finger release” event so it always fires in mobile/PWA/native webview edge cases.

**File:** `src/components/camera/VybeRecordButton.tsx`

- Add `onTouchCancel` → call `onCaptureEnd()`
- Consider switching from mixed touch/mouse handlers to **Pointer Events** (like you already attempted in the older `SnapCamera.tsx`), and use pointer capture:
  - on pointer down: `buttonRef.current?.setPointerCapture(e.pointerId)`
  - on pointer up/cancel: release + `onCaptureEnd()`

This ensures you still get the “up” event even if the finger drifts off the button slightly.

### 4) Cleanup safety (prevents weird stuck states)
**File:** `src/components/camera/VybeSnapCamera.tsx`

- Ensure `handleClose` stops recording and clears flags:
  - `shouldFinalizeOnStopRef.current = false`
  - `segmentsRef.current = []`
  - stop active MediaRecorder if needed
- Add a small effect to stop recording if the page goes background (`visibilitychange`), so it can’t get stuck recording silently.

## Verification checklist (what you should see after)
1) Open DM → open VYBE camera → hold record 2–5 seconds → release  
   - Recording stops
   - Immediately transitions to the edit screen (video preview loop)
2) Tap quickly (no hold) still takes a photo and goes to editor
3) Hold record, flip camera mid-record, then release  
   - Still transitions to editor
   - Video plays as a single merged clip
4) Test on:
   - iPhone Safari (or installed app)
   - Android Chrome
   - Desktop (mouse)

## Notes (mobile/native)
If you’re running this as a true native build (Capacitor): after pulling the updated code you’ll want to run `npx cap sync` so the native projects pick up the changes.

## Next feature ideas
<lov-actions>
  <lov-suggestion message="Test the VYBE Snap flow end-to-end on mobile: hold to record, release to open editor, then send (also test camera flip mid-record).">Verify it works end-to-end</lov-suggestion>
  <lov-suggestion message="Add a 1-tap 'Retake' action in the editor for both photo and video (returns to camera with the same settings).">Add Retake button</lov-suggestion>
  <lov-suggestion message="Add a visible 'Recording…' timer (MM:SS) and a subtle haptic tick every 5 seconds for better feedback.">Add recording timer + haptics</lov-suggestion>
  <lov-suggestion message="Add basic video trimming (start/end handles) in the editor before sending.">Add video trim</lov-suggestion>
  <lov-suggestion message="Improve reliability by adding a fallback: if onstop doesn’t fire within 1s after stop, show an error + Retake.">Add onstop timeout fallback</lov-suggestion>
</lov-actions>
